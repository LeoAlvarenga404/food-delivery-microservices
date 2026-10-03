import { deleteExpiredInboxEntries, withInbox } from '@fd/chassis-inbox';
import { createKafka, startConsumerRunner, type RunningConsumer } from '@fd/chassis-kafka';
import {
  StartedParts,
  startHealthServer,
  startPeriodicJob,
  stopOnSignals,
  type RunningPeriodicJob,
} from '@fd/chassis-lifecycle';
import { createLogger, type Logger } from '@fd/chassis-observability';
import { deleteExpiredOutboxMessages } from '@fd/chassis-outbox';
import { createDatabase, migrateToLatest } from '@fd/chassis-postgres';
import type { Kysely } from 'kysely';
import { v7 as generateUuidV7 } from 'uuid';
import {
  readConsumerServiceConfiguration,
  type ConsumerServiceConfiguration,
} from '#infrastructure/consumer-service.config.ts';
import { consumerCommandConsumer } from '#infrastructure/messaging/inbound/consumer-command.consumer.ts';
import { consumerMigrationSources } from '#infrastructure/persistence/consumer-migration-sources.config.ts';
import { createConsumerUnitOfWork } from '#infrastructure/persistence/consumer-unit-of-work.adapter.ts';
import type { DB as ConsumerDatabase } from '#infrastructure/persistence/generated/database.ts';

export interface RunningConsumerService {
  readonly url: string;
  readonly stop: () => Promise<void>;
}

interface ConsumerServiceParts {
  readonly configuration: ConsumerServiceConfiguration;
  readonly logger: Logger;
  readonly database: Kysely<ConsumerDatabase>;
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
  const { configuration, logger, database } = parts;
  const unitOfWork = createConsumerUnitOfWork({ database, generateMessageId: generateUuidV7, now });
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

export async function startConsumerService(
  configuration: ConsumerServiceConfiguration,
): Promise<RunningConsumerService> {
  const logger = createLogger({ serviceName: 'consumer-service', level: configuration.logLevel });
  const database = openDatabase(configuration, logger);
  const started = new StartedParts();
  started.add(() => database.destroy());
  try {
    await migrateToLatest(database, consumerMigrationSources);
    const parts = { configuration, logger, database };
    const commandConsumer = await startCommandConsumer(parts);
    started.add(() => commandConsumer.stop());
    const housekeeping = startHousekeeping(parts);
    started.add(() => housekeeping.stop());
    const healthServer = await startHealthServer(configuration);
    started.add(() => healthServer.stop());
    logger.info({ url: healthServer.url }, 'consumer service started');
    return { url: healthServer.url, stop: () => started.stopAll() };
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
