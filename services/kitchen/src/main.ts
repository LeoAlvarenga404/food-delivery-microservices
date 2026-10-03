import { withInbox } from '@fd/chassis-inbox';
import { createKafka, startConsumerRunner, type RunningConsumer } from '@fd/chassis-kafka';
import { createLogger, type Logger } from '@fd/chassis-observability';
import { createDatabase, migrateToLatest } from '@fd/chassis-postgres';
import type { Kysely } from 'kysely';
import { v7 as generateUuidV7 } from 'uuid';
import {
  readKitchenServiceConfiguration,
  type KitchenServiceConfiguration,
} from '#infrastructure/kitchen-service.config.ts';
import { kitchenCommandConsumer } from '#infrastructure/messaging/inbound/kitchen-command.consumer.ts';
import type { DB as KitchenDatabase } from '#infrastructure/persistence/generated/database.ts';
import { kitchenMigrationSources } from '#infrastructure/persistence/kitchen-migration-sources.config.ts';
import { createKitchenUnitOfWork } from '#infrastructure/persistence/kitchen-unit-of-work.adapter.ts';
import { UuidV7IdGenerator } from '#infrastructure/system/uuid-v7-id-generator.adapter.ts';

export interface RunningKitchenService {
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

function startCommandConsumer(parts: KitchenServiceParts): Promise<RunningConsumer> {
  const { configuration, logger, database } = parts;
  const unitOfWork = createKitchenUnitOfWork({ database, generateMessageId: generateUuidV7, now });
  return startConsumerRunner({
    kafka: createKafka({
      clientId: 'kitchen-service',
      bootstrapServers: configuration.kafkaBootstrapServers,
    }),
    groupId: 'kitchen-service',
    topics: ['kitchen.commands'],
    handle: withInbox(
      { database, handlerName: 'kitchen-command', now },
      kitchenCommandConsumer({ unitOfWork, idGenerator: new UuidV7IdGenerator(), logger }),
    ),
    logger,
  });
}

export async function startKitchenService(
  configuration: KitchenServiceConfiguration,
): Promise<RunningKitchenService> {
  const logger = createLogger({ serviceName: 'kitchen-service', level: configuration.logLevel });
  const database = openDatabase(configuration, logger);
  try {
    await migrateToLatest(database, kitchenMigrationSources);
    const commandConsumer = await startCommandConsumer({ configuration, logger, database });
    logger.info('kitchen service started');
    return {
      stop: async () => {
        try {
          await commandConsumer.stop();
        } finally {
          await database.destroy();
        }
      },
    };
  } catch (error) {
    await database.destroy().catch((destroyError: unknown) => {
      logger.error({ err: destroyError }, 'releasing the database after a failed start failed');
    });
    throw error;
  }
}

if (import.meta.main) {
  const kitchenService = await startKitchenService(readKitchenServiceConfiguration(process.env));
  const stop = (): void => {
    void kitchenService.stop();
  };
  process.once('SIGINT', stop);
  process.once('SIGTERM', stop);
}
