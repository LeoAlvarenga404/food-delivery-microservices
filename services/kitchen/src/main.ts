import { deleteExpiredInboxEntries } from '@fd/chassis-inbox';
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
import type { Kysely } from 'kysely';
import { v7 as generateUuidV7 } from 'uuid';
import { AdvanceTicketCommandHandler } from '#application/commands/advance-ticket/advance-ticket.command-handler.ts';
import { ListTicketsQueryHandler } from '#application/queries/list-tickets/list-tickets.query-handler.ts';
import {
  readKitchenServiceConfiguration,
  type KitchenServiceConfiguration,
} from '#infrastructure/kitchen-service.config.ts';
import { kitchenInboundConsumer } from '#infrastructure/messaging/inbound/kitchen-inbound.consumer.ts';
import type { DB as KitchenDatabase } from '#infrastructure/persistence/generated/database.ts';
import { kitchenMigrationSources } from '#infrastructure/persistence/kitchen-migration-sources.config.ts';
import {
  createKitchenUnitOfWork,
  type KitchenUnitOfWork,
} from '#infrastructure/persistence/kitchen-unit-of-work.adapter.ts';
import { PostgresRestaurantMembershipRepository } from '#infrastructure/persistence/postgres-restaurant-membership.repository.ts';
import { PostgresTicketRepository } from '#infrastructure/persistence/postgres-ticket.repository.ts';
import { startKitchenHttpServer } from '#infrastructure/rpc/kitchen-http-server.adapter.ts';
import { createKitchenRpcService } from '#infrastructure/rpc/kitchen.rpc-service.ts';
import { SystemClock } from '#infrastructure/system/system-clock.adapter.ts';
import { UuidV7IdGenerator } from '#infrastructure/system/uuid-v7-id-generator.adapter.ts';

export interface RunningKitchenService {
  readonly url: string;
  readonly stop: () => Promise<void>;
}

interface KitchenServiceParts {
  readonly configuration: KitchenServiceConfiguration;
  readonly logger: Logger;
  readonly database: Kysely<KitchenDatabase>;
  readonly unitOfWork: KitchenUnitOfWork;
}

const clock = new SystemClock();
const now = (): Date => clock.now();

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
  const { configuration, logger, database, unitOfWork } = parts;
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

function createRpcService(parts: KitchenServiceParts): ReturnType<typeof createKitchenRpcService> {
  const { database, unitOfWork } = parts;
  const memberships = new PostgresRestaurantMembershipRepository(database);
  return createKitchenRpcService({
    listTickets: new ListTicketsQueryHandler({
      tickets: new PostgresTicketRepository(database),
      memberships,
    }),
    advanceTicket: new AdvanceTicketCommandHandler({ unitOfWork, memberships, clock }),
  });
}

async function startResources(parts: KitchenServiceParts, started: StartedParts): Promise<string> {
  await migrateToLatest(parts.database, kitchenMigrationSources);
  const messageConsumer = await startMessageConsumer(parts);
  started.add(() => messageConsumer.stop());
  const housekeeping = startHousekeeping(parts);
  started.add(() => housekeeping.stop());
  const { configuration, logger } = parts;
  const http = await startKitchenHttpServer({
    configuration,
    logger,
    kitchenService: createRpcService(parts),
  });
  started.add(() => http.server.close());
  return http.url;
}

export async function startKitchenService(
  configuration: KitchenServiceConfiguration,
): Promise<RunningKitchenService> {
  const logger = createLogger({ serviceName: 'kitchen-service', level: configuration.logLevel });
  const database = openDatabase(configuration, logger);
  const unitOfWork = createKitchenUnitOfWork({ database, generateMessageId: generateUuidV7, now });
  const started = new StartedParts();
  started.add(() => database.destroy());
  try {
    const url = await startResources({ configuration, logger, database, unitOfWork }, started);
    logger.info({ url }, 'kitchen service started');
    return { url, stop: () => started.stopAll() };
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
