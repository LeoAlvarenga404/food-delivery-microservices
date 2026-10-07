import { deleteExpiredInboxEntries, withInbox } from '@fd/chassis-inbox';
import {
  createKafka,
  startConsumerRunner,
  type MessageHandler,
  type RunningConsumer,
} from '@fd/chassis-kafka';
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
import type { Clock } from '#application/ports/clock.port.ts';
import {
  readAccountingServiceConfiguration,
  type AccountingServiceConfiguration,
} from '#infrastructure/accounting-service.config.ts';
import { accountingCommandConsumer } from '#infrastructure/messaging/inbound/accounting-command.consumer.ts';
import { SimulatedPaymentGateway } from '#infrastructure/payment/simulated-payment-gateway.adapter.ts';
import { accountingMigrationSources } from '#infrastructure/persistence/accounting-migration-sources.config.ts';
import { createAccountingUnitOfWork } from '#infrastructure/persistence/accounting-unit-of-work.adapter.ts';
import type { DB as AccountingDatabase } from '#infrastructure/persistence/generated/database.ts';
import { SystemClock } from '#infrastructure/system/system-clock.adapter.ts';
import { UuidV7IdGenerator } from '#infrastructure/system/uuid-v7-id-generator.adapter.ts';

export interface RunningAccountingService {
  readonly url: string;
  readonly stop: () => Promise<void>;
}

interface AccountingServiceParts {
  readonly configuration: AccountingServiceConfiguration;
  readonly logger: Logger;
  readonly database: Kysely<AccountingDatabase>;
  readonly clock: Clock;
}

function openDatabase(
  configuration: AccountingServiceConfiguration,
  logger: Logger,
): Kysely<AccountingDatabase> {
  return createDatabase<AccountingDatabase>({
    connectionString: configuration.databaseUrl,
    maximumConnectionCount: 5,
    onConnectionError: (error) => {
      logger.error({ err: error }, 'database connection lost');
    },
  });
}

function createCommandHandler(parts: AccountingServiceParts): MessageHandler {
  const { configuration, logger, database, clock } = parts;
  const now = (): Date => clock.now();
  const paymentGateway = new SimulatedPaymentGateway({
    slowResponseInMilliseconds: configuration.slowGatewayResponseInMilliseconds,
    generateAuthorizationId: generateUuidV7,
    generateVoidId: generateUuidV7,
  });
  return withInbox(
    { database, handlerName: 'accounting-command', now },
    accountingCommandConsumer({
      unitOfWork: createAccountingUnitOfWork({ database, generateMessageId: generateUuidV7, now }),
      paymentGateway,
      idGenerator: new UuidV7IdGenerator(),
      clock,
      logger,
    }),
  );
}

function startCommandConsumer(parts: AccountingServiceParts): Promise<RunningConsumer> {
  const { configuration, logger } = parts;
  return startConsumerRunner({
    kafka: createKafka({
      clientId: 'accounting-service',
      bootstrapServers: configuration.kafkaBootstrapServers,
    }),
    groupId: 'accounting-service',
    topics: ['accounting.commands'],
    handle: createCommandHandler(parts),
    logger,
  });
}

function startHousekeeping(parts: AccountingServiceParts): RunningPeriodicJob {
  const { configuration, logger, database, clock } = parts;
  return startPeriodicJob({
    name: 'housekeeping',
    intervalInMilliseconds: configuration.housekeepingIntervalInMilliseconds,
    run: async () => {
      const deletedOutboxMessageCount = await deleteExpiredOutboxMessages(database, clock.now());
      const deletedInboxEntryCount = await deleteExpiredInboxEntries(database, clock.now());
      logger.info({ deletedOutboxMessageCount, deletedInboxEntryCount }, 'housekeeping done');
    },
    logger,
  });
}

export async function startAccountingService(
  configuration: AccountingServiceConfiguration,
): Promise<RunningAccountingService> {
  const logger = createLogger({ serviceName: 'accounting-service', level: configuration.logLevel });
  const database = openDatabase(configuration, logger);
  const started = new StartedParts();
  started.add(() => database.destroy());
  try {
    await migrateToLatest(database, accountingMigrationSources);
    const parts = { configuration, logger, database, clock: new SystemClock() };
    const commandConsumer = await startCommandConsumer(parts);
    started.add(() => commandConsumer.stop());
    const housekeeping = startHousekeeping(parts);
    started.add(() => housekeeping.stop());
    const healthServer = await startHealthServer(configuration);
    started.add(() => healthServer.stop());
    logger.info({ url: healthServer.url }, 'accounting service started');
    return { url: healthServer.url, stop: () => started.stopAll() };
  } catch (error) {
    await started.stopAll().catch((stopError: unknown) => {
      logger.error({ err: stopError }, 'releasing resources after a failed start failed');
    });
    throw error;
  }
}

if (import.meta.main) {
  const configuration = readAccountingServiceConfiguration(process.env);
  const accountingService = await startAccountingService(configuration);
  const logger = createLogger({ serviceName: 'accounting-service', level: configuration.logLevel });
  stopOnSignals(accountingService, logger);
}
