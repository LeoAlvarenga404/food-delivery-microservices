import { fastifyConnectPlugin } from '@connectrpc/connect-fastify';
import { deleteExpiredInboxEntries, withInbox } from '@fd/chassis-inbox';
import { createKafka, startConsumerRunner, type RunningConsumer } from '@fd/chassis-kafka';
import {
  StartedParts,
  startPeriodicJob,
  stopOnSignals,
  type RunningPeriodicJob,
} from '@fd/chassis-lifecycle';
import { createLogger, type Logger } from '@fd/chassis-observability';
import { deleteExpiredOutboxMessages } from '@fd/chassis-outbox';
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
import { PostgresIdempotencyKeyStore } from '#infrastructure/persistence/postgres-idempotency-key-store.adapter.ts';
import { PostgresOrderRepository } from '#infrastructure/persistence/postgres-order.repository.ts';
import { createOrderRpcService } from '#infrastructure/rpc/order.rpc-service.ts';
import { createRpcCorrelation } from '#infrastructure/rpc/rpc-correlation.adapter.ts';
import { PlaceOrderSagaDeadlineWorker } from '#infrastructure/scheduling/place-order-saga-deadline-worker.adapter.ts';
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
const sagaDeadlineSweepIntervalInMilliseconds = 1_000;
const housekeepingIntervalInMilliseconds = 3_600_000;

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

function startSagaDeadlineWorker(parts: OrderServiceParts): RunningPeriodicJob {
  const { configuration, logger, database, unitOfWork, clock } = parts;
  const worker = new PlaceOrderSagaDeadlineWorker({
    database,
    unitOfWork,
    clock,
    sagaTimeoutsInMilliseconds: configuration.sagaTimeoutsInMilliseconds,
    generateCorrelationId: generateUuidV7,
    logger,
  });
  return startPeriodicJob({
    name: 'place order saga deadlines',
    intervalInMilliseconds: sagaDeadlineSweepIntervalInMilliseconds,
    run: async () => {
      await worker.timeOutExpiredSteps();
    },
    logger,
  });
}

async function deleteExpiredRows(parts: OrderServiceParts): Promise<void> {
  const { logger, database, clock } = parts;
  const now = clock.now();
  const deletedOutboxMessageCount = await deleteExpiredOutboxMessages(database, now);
  const deletedInboxEntryCount = await deleteExpiredInboxEntries(database, now);
  const idempotencyKeys = new PostgresIdempotencyKeyStore(database);
  const deletedIdempotencyKeyCount = await idempotencyKeys.deleteExpired(now);
  logger.info(
    { deletedOutboxMessageCount, deletedInboxEntryCount, deletedIdempotencyKeyCount },
    'housekeeping done',
  );
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

async function startResources(parts: OrderServiceParts, started: StartedParts): Promise<string> {
  const replyConsumer = await startReplyConsumer(parts);
  started.add(() => replyConsumer.stop());
  const sagaDeadlineWorker = startSagaDeadlineWorker(parts);
  started.add(() => sagaDeadlineWorker.stop());
  const housekeeping = startPeriodicJob({
    name: 'housekeeping',
    intervalInMilliseconds: housekeepingIntervalInMilliseconds,
    run: () => deleteExpiredRows(parts),
    logger: parts.logger,
  });
  started.add(() => housekeeping.stop());
  const http = await startHttpServer(parts);
  started.add(() => http.server.close());
  return http.url;
}

export async function startOrderService(
  configuration: OrderServiceConfiguration,
): Promise<RunningOrderService> {
  const parts = await prepareParts(configuration);
  const started = new StartedParts();
  started.add(() => parts.database.destroy());
  try {
    const url = await startResources(parts, started);
    parts.logger.info({ url }, 'order service started');
    return { url, stop: () => started.stopAll() };
  } catch (error) {
    await started.stopAll().catch((stopError: unknown) => {
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
