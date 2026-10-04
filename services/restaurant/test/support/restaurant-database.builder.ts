import { createDatabase, migrateToLatest } from '@fd/chassis-postgres';
import { startPostgresContainer } from '@fd/chassis-testing';
import { sql, type Kysely } from 'kysely';
import type { Restaurant } from '#domain/restaurant/restaurant.aggregate.ts';
import type { DB as RestaurantDatabase } from '#infrastructure/persistence/generated/database.ts';
import { restaurantMigrationSources } from '#infrastructure/persistence/restaurant-migration-sources.config.ts';
import { restaurantPersistenceMapper } from '#infrastructure/persistence/restaurant.persistence-mapper.ts';

export interface RestaurantTestDatabase {
  readonly database: Kysely<RestaurantDatabase>;
  readonly replaceRestaurants: (restaurants: readonly Restaurant[]) => Promise<void>;
  readonly clearWrittenRows: () => Promise<void>;
  readonly stop: () => Promise<void>;
}

async function replaceRestaurants(
  database: Kysely<RestaurantDatabase>,
  restaurants: readonly Restaurant[],
): Promise<void> {
  await sql`truncate menu_items, restaurant_members, restaurants`.execute(database);
  for (const restaurant of restaurants) {
    const rows = restaurantPersistenceMapper.toPersistence(restaurant);
    await database
      .insertInto('restaurants')
      .values({ ...rows.restaurant, openingHours: JSON.stringify(rows.restaurant.openingHours) })
      .execute();
    await database.insertInto('restaurantMembers').values(rows.members).execute();
    if (rows.menuItems.length > 0) {
      await database.insertInto('menuItems').values(rows.menuItems.toReversed()).execute();
    }
  }
}

export async function startRestaurantTestDatabase(): Promise<RestaurantTestDatabase> {
  const postgres = await startPostgresContainer();
  const database = createDatabase<RestaurantDatabase>({
    connectionString: postgres.connectionUri,
    maximumConnectionCount: 5,
    onConnectionError: () => undefined,
  });
  await migrateToLatest(database, restaurantMigrationSources);
  return {
    database,
    replaceRestaurants: (restaurants) => replaceRestaurants(database, restaurants),
    clearWrittenRows: async () => {
      await sql`truncate outbox`.execute(database);
    },
    stop: async () => {
      await database.destroy();
      await postgres.stop();
    },
  };
}
