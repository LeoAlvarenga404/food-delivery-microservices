import { withInbox } from '@fd/chassis-inbox';
import { createKafka, startConsumerRunner, type RunningConsumer } from '@fd/chassis-kafka';
import { createLogger, type Logger } from '@fd/chassis-observability';
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

export async function startConsumerService(
  configuration: ConsumerServiceConfiguration,
): Promise<RunningConsumerService> {
  const logger = createLogger({ serviceName: 'consumer-service', level: configuration.logLevel });
  const database = openDatabase(configuration, logger);
  try {
    await migrateToLatest(database, consumerMigrationSources);
    const commandConsumer = await startCommandConsumer({ configuration, logger, database });
    logger.info('consumer service started');
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
  const consumerService = await startConsumerService(readConsumerServiceConfiguration(process.env));
  const stop = (): void => {
    void consumerService.stop();
  };
  process.once('SIGINT', stop);
  process.once('SIGTERM', stop);
}
