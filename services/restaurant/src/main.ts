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
import { Client } from '@opensearch-project/opensearch';
import type { Kysely } from 'kysely';
import { v7 as generateUuidV7 } from 'uuid';
import { OnboardRestaurantCommandHandler } from '#application/commands/onboard-restaurant/onboard-restaurant.command-handler.ts';
import { RebuildSearchIndexCommandHandler } from '#application/commands/rebuild-search-index/rebuild-search-index.command-handler.ts';
import { ReviseMenuCommandHandler } from '#application/commands/revise-menu/revise-menu.command-handler.ts';
import { GetPublicRestaurantQueryHandler } from '#application/queries/get-public-restaurant/get-public-restaurant.query-handler.ts';
import { GetRestaurantQueryHandler } from '#application/queries/get-restaurant/get-restaurant.query-handler.ts';
import { ListMembershipsQueryHandler } from '#application/queries/list-memberships/list-memberships.query-handler.ts';
import { SearchRestaurantsQueryHandler } from '#application/queries/search-restaurants/search-restaurants.query-handler.ts';
import { menuRevisedConsumer } from '#infrastructure/messaging/inbound/menu-revised.consumer.ts';
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
import { createRestaurantCatalogueRpcService } from '#infrastructure/rpc/restaurant-catalogue.rpc-service.ts';
import {
  startRestaurantHttpServer,
  type RestaurantHttpServerSettings,
} from '#infrastructure/rpc/restaurant-http-server.adapter.ts';
import { createRestaurantRpcService } from '#infrastructure/rpc/restaurant.rpc-service.ts';
import { OpenSearchRestaurantSearchIndex } from '#infrastructure/search/open-search-restaurant-search-index.adapter.ts';
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
  readonly searchIndex: OpenSearchRestaurantSearchIndex;
}

const restaurantSearchIndexAlias = 'restaurants';
const clock = new SystemClock();

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

function openSearchIndex(client: Client): OpenSearchRestaurantSearchIndex {
  return new OpenSearchRestaurantSearchIndex({
    client,
    indexAlias: restaurantSearchIndexAlias,
    shouldRefreshOnWrite: false,
  });
}

function startHousekeeping(parts: RestaurantServiceParts): RunningPeriodicJob {
  const { configuration, logger, database } = parts;
  return startPeriodicJob({
    name: 'housekeeping',
    intervalInMilliseconds: configuration.housekeepingIntervalInMilliseconds,
    run: async () => {
      const deletedOutboxMessageCount = await deleteExpiredOutboxMessages(database, clock.now());
      logger.info({ deletedOutboxMessageCount }, 'housekeeping done');
    },
    logger,
  });
}

function startMessageConsumer(parts: RestaurantServiceParts): Promise<RunningConsumer> {
  const { configuration, logger, searchIndex } = parts;
  return startConsumerRunner({
    kafka: createKafka({
      clientId: 'restaurant-service',
      bootstrapServers: configuration.kafkaBootstrapServers,
    }),
    groupId: 'restaurant-service',
    topics: ['restaurant.restaurant.state'],
    handle: menuRevisedConsumer({ searchIndex, logger }),
    logger,
  });
}

function createRpcServices(
  parts: RestaurantServiceParts,
): Pick<RestaurantHttpServerSettings, 'restaurantService' | 'catalogueService'> {
  const { database, unitOfWork, searchIndex } = parts;
  const restaurants = new PostgresRestaurantRepository(database);
  return {
    restaurantService: createRestaurantRpcService({
      onboardRestaurant: new OnboardRestaurantCommandHandler({
        unitOfWork,
        clock,
        idGenerator: new UuidV7IdGenerator(),
      }),
      reviseMenu: new ReviseMenuCommandHandler({ unitOfWork, clock }),
      getRestaurant: new GetRestaurantQueryHandler(restaurants),
      listMemberships: new ListMembershipsQueryHandler(restaurants),
    }),
    catalogueService: createRestaurantCatalogueRpcService({
      searchRestaurants: new SearchRestaurantsQueryHandler(searchIndex, clock),
      getPublicRestaurant: new GetPublicRestaurantQueryHandler(restaurants),
    }),
  };
}

async function startResources(
  parts: RestaurantServiceParts,
  started: StartedParts,
): Promise<string> {
  await migrateToLatest(parts.database, restaurantMigrationSources);
  await parts.searchIndex.createIfMissing();
  const housekeeping = startHousekeeping(parts);
  started.add(() => housekeeping.stop());
  const messageConsumer = await startMessageConsumer(parts);
  started.add(() => messageConsumer.stop());
  const { configuration, logger } = parts;
  const http = await startRestaurantHttpServer({
    configuration,
    logger,
    ...createRpcServices(parts),
  });
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
    now: () => clock.now(),
  });
  const searchClient = new Client({ node: configuration.openSearchUrl });
  const started = new StartedParts();
  started.add(() => database.destroy());
  started.add(() => searchClient.close());
  try {
    const searchIndex = openSearchIndex(searchClient);
    const parts = { configuration, logger, database, unitOfWork, searchIndex };
    const url = await startResources(parts, started);
    logger.info({ url }, 'restaurant service started');
    return { url, stop: () => started.stopAll() };
  } catch (error) {
    await started.stopAll().catch((stopError: unknown) => {
      logger.error({ err: stopError }, 'releasing resources after a failed start failed');
    });
    throw error;
  }
}

export async function rebuildSearchIndex(
  configuration: RestaurantServiceConfiguration,
): Promise<number> {
  const logger = createLogger({ serviceName: 'restaurant-service', level: configuration.logLevel });
  const database = openDatabase(configuration, logger);
  const searchClient = new Client({ node: configuration.openSearchUrl });
  try {
    const rebuild = new RebuildSearchIndexCommandHandler(
      new PostgresRestaurantRepository(database),
      openSearchIndex(searchClient),
    );
    const restaurantCount = await rebuild.execute();
    logger.info({ restaurantCount }, 'search index rebuilt');
    return restaurantCount;
  } finally {
    await searchClient.close();
    await database.destroy();
  }
}

if (import.meta.main) {
  const configuration = readRestaurantServiceConfiguration(process.env);
  if (process.argv.includes('rebuild-search-index')) {
    await rebuildSearchIndex(configuration);
  } else {
    const restaurantService = await startRestaurantService(configuration);
    const logger = createLogger({
      serviceName: 'restaurant-service',
      level: configuration.logLevel,
    });
    stopOnSignals(restaurantService, logger);
  }
}
