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
import { createServiceRpcInterceptors } from '@fd/chassis-rpc';
import { ConsumerService } from '@fd/contracts/fooddelivery/consumer/v1/service_pb.js';
import { fastify, type FastifyInstance } from 'fastify';
import type { Kysely } from 'kysely';
import { v7 as generateUuidV7 } from 'uuid';
import { RegisterConsumerCommandHandler } from '#application/commands/register-consumer/register-consumer.command-handler.ts';
import { GetConsumerQueryHandler } from '#application/queries/get-consumer/get-consumer.query-handler.ts';
import {
  readConsumerServiceConfiguration,
  type ConsumerServiceConfiguration,
} from '#infrastructure/consumer-service.config.ts';
import { consumerCommandConsumer } from '#infrastructure/messaging/inbound/consumer-command.consumer.ts';
import { consumerMigrationSources } from '#infrastructure/persistence/consumer-migration-sources.config.ts';
import {
  createConsumerUnitOfWork,
  type ConsumerUnitOfWork,
} from '#infrastructure/persistence/consumer-unit-of-work.adapter.ts';
import type { DB as ConsumerDatabase } from '#infrastructure/persistence/generated/database.ts';
import { PostgresConsumerRepository } from '#infrastructure/persistence/postgres-consumer.repository.ts';
import { createConsumerRpcService } from '#infrastructure/rpc/consumer.rpc-service.ts';

export interface RunningConsumerService {
  readonly url: string;
  readonly stop: () => Promise<void>;
}

interface ConsumerServiceParts {
  readonly configuration: ConsumerServiceConfiguration;
  readonly logger: Logger;
  readonly database: Kysely<ConsumerDatabase>;
  readonly unitOfWork: ConsumerUnitOfWork;
}

interface RunningHttpServer {
  readonly server: FastifyInstance;
  readonly url: string;
}

const now = (): Date => new Date();

function openDatabase(
  configuration: ConsumerServiceConfiguration,
  logger: Logger,
): Kysely<ConsumerDatabase> {
  return createDatabase<ConsumerDatabase>({
    connectionString: configuration.databaseUrl,
    maximumConnectionCount: 5,
    onConnectionError: (error) => {
      logger.error({ err: error }, 'database connection lost');
    },
  });
}

function startCommandConsumer(parts: ConsumerServiceParts): Promise<RunningConsumer> {
  const { configuration, logger, database, unitOfWork } = parts;
  return startConsumerRunner({
    kafka: createKafka({
      clientId: 'consumer-service',
      bootstrapServers: configuration.kafkaBootstrapServers,
    }),
    groupId: 'consumer-service',
    topics: ['consumer.commands'],
    handle: withInbox(
      { database, handlerName: 'consumer-command', now },
      consumerCommandConsumer({ unitOfWork, logger }),
    ),
    logger,
  });
}

function startHousekeeping(parts: ConsumerServiceParts): RunningPeriodicJob {
  const { configuration, logger, database } = parts;
  return startPeriodicJob({
    name: 'housekeeping',
    intervalInMilliseconds: configuration.housekeepingIntervalInMilliseconds,
    run: async () => {
      const deletedOutboxMessageCount = await deleteExpiredOutboxMessages(database, now());
      const deletedInboxEntryCount = await deleteExpiredInboxEntries(database, now());
      logger.info({ deletedOutboxMessageCount, deletedInboxEntryCount }, 'housekeeping done');
    },
    logger,
  });
}

async function startHttpServer(parts: ConsumerServiceParts): Promise<RunningHttpServer> {
  const { configuration, logger, database, unitOfWork } = parts;
  const rpcService = createConsumerRpcService({
    registerConsumer: new RegisterConsumerCommandHandler(unitOfWork),
    getConsumer: new GetConsumerQueryHandler(new PostgresConsumerRepository(database)),
  });
  const server = fastify();
  await server.register(fastifyConnectPlugin, {
    routes: (router) => router.service(ConsumerService, rpcService),
    interceptors: createServiceRpcInterceptors('consumer-service', configuration, logger),
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

async function startResources(parts: ConsumerServiceParts, started: StartedParts): Promise<string> {
  await migrateToLatest(parts.database, consumerMigrationSources);
  const commandConsumer = await startCommandConsumer(parts);
  started.add(() => commandConsumer.stop());
  const housekeeping = startHousekeeping(parts);
  started.add(() => housekeeping.stop());
  const http = await startHttpServer(parts);
  started.add(() => http.server.close());
  return http.url;
}

export async function startConsumerService(
  configuration: ConsumerServiceConfiguration,
): Promise<RunningConsumerService> {
  const logger = createLogger({ serviceName: 'consumer-service', level: configuration.logLevel });
  const database = openDatabase(configuration, logger);
  const unitOfWork = createConsumerUnitOfWork({ database, generateMessageId: generateUuidV7, now });
  const started = new StartedParts();
  started.add(() => database.destroy());
  try {
    const url = await startResources({ configuration, logger, database, unitOfWork }, started);
    logger.info({ url }, 'consumer service started');
    return { url, stop: () => started.stopAll() };
  } catch (error) {
    await started.stopAll().catch((stopError: unknown) => {
      logger.error({ err: stopError }, 'releasing resources after a failed start failed');
    });
    throw error;
  }
}

if (import.meta.main) {
  const configuration = readConsumerServiceConfiguration(process.env);
  const consumerService = await startConsumerService(configuration);
  const logger = createLogger({ serviceName: 'consumer-service', level: configuration.logLevel });
  stopOnSignals(consumerService, logger);
}
