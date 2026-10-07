import { deleteExpiredInboxEntries } from '@fd/chassis-inbox';
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
  readKitchenServiceConfiguration,
  type KitchenServiceConfiguration,
} from '#infrastructure/kitchen-service.config.ts';
import { kitchenInboundConsumer } from '#infrastructure/messaging/inbound/kitchen-inbound.consumer.ts';
import type { DB as KitchenDatabase } from '#infrastructure/persistence/generated/database.ts';
import { kitchenMigrationSources } from '#infrastructure/persistence/kitchen-migration-sources.config.ts';
import { createKitchenUnitOfWork } from '#infrastructure/persistence/kitchen-unit-of-work.adapter.ts';
import { UuidV7IdGenerator } from '#infrastructure/system/uuid-v7-id-generator.adapter.ts';

export interface RunningKitchenService {
  readonly url: string;
  readonly stop: () => Promise<void>;
}

interface KitchenServiceParts {
  readonly configuration: KitchenServiceConfiguration;
  readonly logger: Logger;
  readonly database: Kysely<KitchenDatabase>;
}

const now = (): Date => new Date();

function openDatabase(
  configuration: KitchenServiceConfiguration,
  logger: Logger,
): Kysely<KitchenDatabase> {
  return createDatabase<KitchenDatabase>({
    connectionString: configuration.databaseUrl,
    maximumConnectionCount: 5,
    onConnectionError: (error) => {
      logger.error({ err: error }, 'database connection lost');
    },
  });
}

function startMessageConsumer(parts: KitchenServiceParts): Promise<RunningConsumer> {
  const { configuration, logger, database } = parts;
  const unitOfWork = createKitchenUnitOfWork({ database, generateMessageId: generateUuidV7, now });
  const subscription = kitchenInboundConsumer({
    database,
    unitOfWork,
    idGenerator: new UuidV7IdGenerator(),
    now,
    logger,
  });
  return startConsumerRunner({
    kafka: createKafka({
      clientId: 'kitchen-service',
      bootstrapServers: configuration.kafkaBootstrapServers,
    }),
    groupId: 'kitchen-service',
    ...subscription,
    logger,
  });
}

function startHousekeeping(parts: KitchenServiceParts): RunningPeriodicJob {
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

export async function startKitchenService(
  configuration: KitchenServiceConfiguration,
): Promise<RunningKitchenService> {
  const logger = createLogger({ serviceName: 'kitchen-service', level: configuration.logLevel });
  const database = openDatabase(configuration, logger);
  const started = new StartedParts();
  started.add(() => database.destroy());
  try {
    await migrateToLatest(database, kitchenMigrationSources);
    const parts = { configuration, logger, database };
    const messageConsumer = await startMessageConsumer(parts);
    started.add(() => messageConsumer.stop());
    const housekeeping = startHousekeeping(parts);
    started.add(() => housekeeping.stop());
    const healthServer = await startHealthServer(configuration);
    started.add(() => healthServer.stop());
    logger.info({ url: healthServer.url }, 'kitchen service started');
    return { url: healthServer.url, stop: () => started.stopAll() };
  } catch (error) {
    await started.stopAll().catch((stopError: unknown) => {
      logger.error({ err: stopError }, 'releasing resources after a failed start failed');
    });
    throw error;
  }
}

if (import.meta.main) {
  const configuration = readKitchenServiceConfiguration(process.env);
  const kitchenService = await startKitchenService(configuration);
  const logger = createLogger({ serviceName: 'kitchen-service', level: configuration.logLevel });
  stopOnSignals(kitchenService, logger);
}
