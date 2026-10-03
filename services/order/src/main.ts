import { fastifyConnectPlugin } from '@connectrpc/connect-fastify';
import { withInbox } from '@fd/chassis-inbox';
import { createKafka, startConsumerRunner, type RunningConsumer } from '@fd/chassis-kafka';
import { stopInOrder, stopOnSignals, type Stopper } from '@fd/chassis-lifecycle';
import { createLogger, type Logger } from '@fd/chassis-observability';
import { createDatabase, migrateToLatest } from '@fd/chassis-postgres';
import { OrderService } from '@fd/contracts/fooddelivery/order/v1/service_pb.js';
import { fastify, type FastifyInstance } from 'fastify';
import type { Kysely } from 'kysely';
import { v7 as generateUuidV7 } from 'uuid';
import type { Clock } from '#application/ports/clock.port.ts';
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
import { createRpcCorrelation } from '#infrastructure/rpc/rpc-correlation.adapter.ts';
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
  readonly clock: Clock;
}

interface RunningHttpServer {
  readonly server: FastifyInstance;
  readonly url: string;
}

const placeOrderSagaRepliesTopic = 'order.place-order-saga.replies';

async function startHttpServer(parts: OrderServiceParts): Promise<RunningHttpServer> {
  const { configuration, logger, database, unitOfWork, clock } = parts;
  const rpcService = createOrderRpcService({
    placeOrder: new PlaceOrderCommandHandler({
      unitOfWork,
      clock,
      idGenerator: new UuidV7IdGenerator(),
      sagaTimeoutsInMilliseconds: configuration.sagaTimeoutsInMilliseconds,
    }),
    getOrder: new GetOrderQueryHandler(new PostgresOrderRepository(database)),
  });
  const server = fastify();
  await server.register(fastifyConnectPlugin, {
    routes: (router) => router.service(OrderService, rpcService),
    interceptors: [createRpcCorrelation({ logger, generateCorrelationId: generateUuidV7 })],
  });
  server.get('/health', () => ({ status: 'ok' }));
  try {
    const url = await server.listen({ host: configuration.host, port: configuration.port });
    return { server, url };
  } catch (error) {
    await server.close();
    throw error;
  }
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
      placeOrderSagaReplyConsumer({
        unitOfWork,
        clock,
        sagaTimeoutsInMilliseconds: configuration.sagaTimeoutsInMilliseconds,
        logger,
      }),
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
  try {
    await migrateToLatest(database, orderMigrationSources);
  } catch (error) {
    await database.destroy();
    throw error;
  }
  const clock = new SystemClock();
  const unitOfWork = createOrderUnitOfWork({
    database,
    generateMessageId: generateUuidV7,
    now: () => clock.now(),
  });
  return { configuration, logger, database, unitOfWork, clock };
}

async function startResources(parts: OrderServiceParts, stoppers: Stopper[]): Promise<string> {
  const replyConsumer = await startReplyConsumer(parts);
  stoppers.unshift(() => replyConsumer.stop());
  const http = await startHttpServer(parts);
  stoppers.unshift(() => http.server.close());
  return http.url;
}

export async function startOrderService(
  configuration: OrderServiceConfiguration,
): Promise<RunningOrderService> {
  const parts = await prepareParts(configuration);
  const stoppers: Stopper[] = [() => parts.database.destroy()];
  try {
    const url = await startResources(parts, stoppers);
    parts.logger.info({ url }, 'order service started');
    return { url, stop: () => stopInOrder(stoppers) };
  } catch (error) {
    await stopInOrder(stoppers).catch((stopError: unknown) => {
      parts.logger.error({ err: stopError }, 'releasing resources after a failed start failed');
    });
    throw error;
  }
}

if (import.meta.main) {
  const configuration = readOrderServiceConfiguration(process.env);
  const orderService = await startOrderService(configuration);
  const logger = createLogger({ serviceName: 'order-service', level: configuration.logLevel });
  stopOnSignals(orderService, logger);
}
