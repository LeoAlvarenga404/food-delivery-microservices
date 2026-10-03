import { withInbox } from '@fd/chassis-inbox';
import { createKafka, startConsumerRunner, type RunningConsumer } from '@fd/chassis-kafka';
import { startHealthServer, stopInOrder, stopOnSignals, type Stopper } from '@fd/chassis-lifecycle';
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
  const stoppers: Stopper[] = [() => database.destroy()];
  try {
    await migrateToLatest(database, kitchenMigrationSources);
    const commandConsumer = await startCommandConsumer({ configuration, logger, database });
    stoppers.unshift(() => commandConsumer.stop());
    const healthServer = await startHealthServer(configuration);
    stoppers.unshift(() => healthServer.stop());
    logger.info({ url: healthServer.url }, 'kitchen service started');
    return { url: healthServer.url, stop: () => stopInOrder(stoppers) };
  } catch (error) {
    await stopInOrder(stoppers).catch((stopError: unknown) => {
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
