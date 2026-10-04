import { afterAll, beforeAll } from 'vitest';
import {
  startRestaurantTestDatabase,
  type RestaurantTestDatabase,
} from '../../../test/support/restaurant-database.builder.ts';
import { describeRestaurantRepositoryContract } from '../../../test/support/restaurant-repository.contract.ts';
import { PostgresRestaurantRepository } from './postgres-restaurant.repository.ts';

let testDatabase: RestaurantTestDatabase;

beforeAll(async () => {
  testDatabase = await startRestaurantTestDatabase();
});

afterAll(async () => {
  await testDatabase.stop();
});

describeRestaurantRepositoryContract('postgres', async (storedRestaurants) => {
  await testDatabase.replaceRestaurants(storedRestaurants);
  return new PostgresRestaurantRepository(testDatabase.database);
});
