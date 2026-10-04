import { fastifyConnectPlugin } from '@connectrpc/connect-fastify';
import {
  StartedParts,
  startPeriodicJob,
  stopOnSignals,
  type RunningPeriodicJob,
} from '@fd/chassis-lifecycle';
import { createLogger, type Logger } from '@fd/chassis-observability';
import { deleteExpiredOutboxMessages } from '@fd/chassis-outbox';
import { createDatabase, migrateToLatest } from '@fd/chassis-postgres';
import { RestaurantService } from '@fd/contracts/fooddelivery/restaurant/v1/service_pb.js';
import { fastify, type FastifyInstance } from 'fastify';
import type { Kysely } from 'kysely';
import { v7 as generateUuidV7 } from 'uuid';
import { OnboardRestaurantCommandHandler } from '#application/commands/onboard-restaurant/onboard-restaurant.command-handler.ts';
import { ReviseMenuCommandHandler } from '#application/commands/revise-menu/revise-menu.command-handler.ts';
import { GetRestaurantQueryHandler } from '#application/queries/get-restaurant/get-restaurant.query-handler.ts';
import { ListMembershipsQueryHandler } from '#application/queries/list-memberships/list-memberships.query-handler.ts';
import type { DB as RestaurantDatabase } from '#infrastructure/persistence/generated/database.ts';
import { PostgresRestaurantRepository } from '#infrastructure/persistence/postgres-restaurant.repository.ts';
import { restaurantMigrationSources } from '#infrastructure/persistence/restaurant-migration-sources.config.ts';
import {
  createRestaurantUnitOfWork,
  type RestaurantUnitOfWork,
} from '#infrastructure/persistence/restaurant-unit-of-work.adapter.ts';
import {
  readRestaurantServiceConfiguration,
  type RestaurantServiceConfiguration,
} from '#infrastructure/restaurant-service.config.ts';
import { createRestaurantRpcInterceptors } from '#infrastructure/rpc/restaurant-rpc-interceptors.adapter.ts';
import { createRestaurantRpcService } from '#infrastructure/rpc/restaurant.rpc-service.ts';
import { SystemClock } from '#infrastructure/system/system-clock.adapter.ts';
import { UuidV7IdGenerator } from '#infrastructure/system/uuid-v7-id-generator.adapter.ts';

export interface RunningRestaurantService {
  readonly url: string;
  readonly stop: () => Promise<void>;
}

interface RestaurantServiceParts {
  readonly configuration: RestaurantServiceConfiguration;
  readonly logger: Logger;
  readonly database: Kysely<RestaurantDatabase>;
  readonly unitOfWork: RestaurantUnitOfWork;
}

interface RunningHttpServer {
  readonly server: FastifyInstance;
  readonly url: string;
}

const now = (): Date => new Date();

function openDatabase(
  configuration: RestaurantServiceConfiguration,
  logger: Logger,
): Kysely<RestaurantDatabase> {
  return createDatabase<RestaurantDatabase>({
    connectionString: configuration.databaseUrl,
    maximumConnectionCount: 5,
    onConnectionError: (error) => {
      logger.error({ err: error }, 'database connection lost');
    },
  });
}

function startHousekeeping(parts: RestaurantServiceParts): RunningPeriodicJob {
  const { configuration, logger, database } = parts;
  return startPeriodicJob({
    name: 'housekeeping',
    intervalInMilliseconds: configuration.housekeepingIntervalInMilliseconds,
    run: async () => {
      const deletedOutboxMessageCount = await deleteExpiredOutboxMessages(database, now());
      logger.info({ deletedOutboxMessageCount }, 'housekeeping done');
    },
    logger,
  });
}

function createRpcService(
  parts: RestaurantServiceParts,
): ReturnType<typeof createRestaurantRpcService> {
  const { database, unitOfWork } = parts;
  const clock = new SystemClock();
  const restaurants = new PostgresRestaurantRepository(database);
  return createRestaurantRpcService({
    onboardRestaurant: new OnboardRestaurantCommandHandler({
      unitOfWork,
      clock,
      idGenerator: new UuidV7IdGenerator(),
    }),
    reviseMenu: new ReviseMenuCommandHandler({ unitOfWork, clock }),
    getRestaurant: new GetRestaurantQueryHandler(restaurants),
    listMemberships: new ListMembershipsQueryHandler(restaurants),
  });
}

async function startHttpServer(parts: RestaurantServiceParts): Promise<RunningHttpServer> {
  const { configuration, logger } = parts;
  const rpcService = createRpcService(parts);
  const server = fastify();
  await server.register(fastifyConnectPlugin, {
    routes: (router) => router.service(RestaurantService, rpcService),
    interceptors: createRestaurantRpcInterceptors(configuration, logger),
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

async function startResources(
  parts: RestaurantServiceParts,
  started: StartedParts,
): Promise<string> {
  await migrateToLatest(parts.database, restaurantMigrationSources);
  const housekeeping = startHousekeeping(parts);
  started.add(() => housekeeping.stop());
  const http = await startHttpServer(parts);
  started.add(() => http.server.close());
  return http.url;
}

export async function startRestaurantService(
  configuration: RestaurantServiceConfiguration,
): Promise<RunningRestaurantService> {
  const logger = createLogger({ serviceName: 'restaurant-service', level: configuration.logLevel });
  const database = openDatabase(configuration, logger);
  const unitOfWork = createRestaurantUnitOfWork({
    database,
    generateMessageId: generateUuidV7,
    now,
  });
  const started = new StartedParts();
  started.add(() => database.destroy());
  try {
    const url = await startResources({ configuration, logger, database, unitOfWork }, started);
    logger.info({ url }, 'restaurant service started');
    return { url, stop: () => started.stopAll() };
  } catch (error) {
    await started.stopAll().catch((stopError: unknown) => {
      logger.error({ err: stopError }, 'releasing resources after a failed start failed');
    });
    throw error;
  }
}

if (import.meta.main) {
  const configuration = readRestaurantServiceConfiguration(process.env);
  const restaurantService = await startRestaurantService(configuration);
  const logger = createLogger({ serviceName: 'restaurant-service', level: configuration.logLevel });
  stopOnSignals(restaurantService, logger);
}
