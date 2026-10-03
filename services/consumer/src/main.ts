import { withInbox } from '@fd/chassis-inbox';
import { createKafka, startConsumerRunner, type RunningConsumer } from '@fd/chassis-kafka';
import { startHealthServer, stopInOrder, stopOnSignals, type Stopper } from '@fd/chassis-lifecycle';
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

export async function startConsumerService(
  configuration: ConsumerServiceConfiguration,
): Promise<RunningConsumerService> {
  const logger = createLogger({ serviceName: 'consumer-service', level: configuration.logLevel });
  const database = openDatabase(configuration, logger);
  const stoppers: Stopper[] = [() => database.destroy()];
  try {
    await migrateToLatest(database, consumerMigrationSources);
    const commandConsumer = await startCommandConsumer({ configuration, logger, database });
    stoppers.unshift(() => commandConsumer.stop());
    const healthServer = await startHealthServer(configuration);
    stoppers.unshift(() => healthServer.stop());
    logger.info({ url: healthServer.url }, 'consumer service started');
    return { url: healthServer.url, stop: () => stopInOrder(stoppers) };
  } catch (error) {
    await stopInOrder(stoppers).catch((stopError: unknown) => {
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
