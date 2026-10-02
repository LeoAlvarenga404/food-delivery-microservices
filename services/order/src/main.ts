import { fastifyConnectPlugin } from '@connectrpc/connect-fastify';
import { withInbox } from '@fd/chassis-inbox';
import { createKafka, startConsumerRunner, type RunningConsumer } from '@fd/chassis-kafka';
import { createLogger, type Logger } from '@fd/chassis-observability';
import { createDatabase, migrateToLatest } from '@fd/chassis-postgres';
import { OrderService } from '@fd/contracts/fooddelivery/order/v1/service_pb.js';
import { fastify, type FastifyInstance } from 'fastify';
import type { Kysely } from 'kysely';
import { v7 as generateUuidV7 } from 'uuid';
import { PlaceOrderCommandHandler } from '#application/commands/place-order/place-order.command-handler.ts';
import { GetOrderQueryHandler } from '#application/queries/get-order/get-order.query-handler.ts';
import { placeOrderSagaReplyConsumer } from '#infrastructure/messaging/inbound/place-order-saga-reply.consumer.ts';
import {
  readOrderServiceConfiguration,
  type OrderServiceConfiguration,
} from '#infrastructure/order-service.config.ts';
import type { DB as OrderDatabase } from '#infrastructure/persistence/generated/database.ts';
import { orderMigrationSources } from '#infrastructure/persistence/order-migration-sources.config.ts';
import {
  createOrderUnitOfWork,
  type OrderUnitOfWork,
} from '#infrastructure/persistence/order-unit-of-work.adapter.ts';
import { PostgresOrderRepository } from '#infrastructure/persistence/postgres-order.repository.ts';
import { createOrderRpcService } from '#infrastructure/rpc/order.rpc-service.ts';
import { createRpcFailureLogging } from '#infrastructure/rpc/rpc-failure-logging.adapter.ts';
import { SystemClock } from '#infrastructure/system/system-clock.adapter.ts';
import { UuidV7IdGenerator } from '#infrastructure/system/uuid-v7-id-generator.adapter.ts';

export interface RunningOrderService {
  readonly url: string;
  readonly stop: () => Promise<void>;
}

interface OrderServiceParts {
  readonly configuration: OrderServiceConfiguration;
  readonly logger: Logger;
  readonly database: Kysely<OrderDatabase>;
  readonly unitOfWork: OrderUnitOfWork;
  readonly clock: SystemClock;
}

interface RunningHttpServer {
  readonly server: FastifyInstance;
  readonly url: string;
}

const placeOrderSagaRepliesTopic = 'order.place-order-saga.replies';

async function startHttpServer(parts: OrderServiceParts): Promise<RunningHttpServer> {
  const { configuration, logger, database, unitOfWork, clock } = parts;
  const rpcService = createOrderRpcService({
    placeOrder: new PlaceOrderCommandHandler(unitOfWork, clock, new UuidV7IdGenerator()),
    getOrder: new GetOrderQueryHandler(new PostgresOrderRepository(database)),
  });
  const server = fastify();
  await server.register(fastifyConnectPlugin, {
    routes: (router) => router.service(OrderService, rpcService),
    interceptors: [createRpcFailureLogging({ logger, generateCorrelationId: generateUuidV7 })],
  });
  server.get('/health', () => ({ status: 'ok' }));
  const url = await server.listen({ host: configuration.host, port: configuration.port });
  return { server, url };
}

async function startReplyConsumer(parts: OrderServiceParts): Promise<RunningConsumer> {
  const { configuration, logger, database, unitOfWork, clock } = parts;
  return startConsumerRunner({
    kafka: createKafka({
      clientId: 'order-service',
      bootstrapServers: configuration.kafkaBootstrapServers,
    }),
    groupId: 'order-service',
    topics: [placeOrderSagaRepliesTopic],
    handle: withInbox(
      { database, handlerName: 'place-order-saga-reply', now: () => clock.now() },
      placeOrderSagaReplyConsumer({ unitOfWork, clock, logger }),
    ),
    logger,
  });
}

async function prepareParts(configuration: OrderServiceConfiguration): Promise<OrderServiceParts> {
  const logger = createLogger({ serviceName: 'order-service', level: configuration.logLevel });
  const database = createDatabase<OrderDatabase>({
    connectionString: configuration.databaseUrl,
    maximumConnectionCount: 10,
    onConnectionError: (error) => {
      logger.error({ err: error }, 'database connection lost');
    },
  });
  await migrateToLatest(database, orderMigrationSources);
  const clock = new SystemClock();
  const unitOfWork = createOrderUnitOfWork({
    database,
    generateMessageId: generateUuidV7,
    now: () => clock.now(),
  });
  return { configuration, logger, database, unitOfWork, clock };
}

export async function startOrderService(
  configuration: OrderServiceConfiguration,
): Promise<RunningOrderService> {
  const parts = await prepareParts(configuration);
  const replyConsumer = await startReplyConsumer(parts);
  const http = await startHttpServer(parts);
  parts.logger.info({ url: http.url }, 'order service started');
  return {
    url: http.url,
    stop: async () => {
      await http.server.close();
      await replyConsumer.stop();
      await parts.database.destroy();
    },
  };
}

if (import.meta.main) {
  const orderService = await startOrderService(readOrderServiceConfiguration(process.env));
  const stop = (): void => {
    void orderService.stop();
  };
  process.once('SIGINT', stop);
  process.once('SIGTERM', stop);
}
