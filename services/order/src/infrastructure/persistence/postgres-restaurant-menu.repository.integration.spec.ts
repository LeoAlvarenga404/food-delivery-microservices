import { afterAll, beforeAll } from 'vitest';
import {
  startOrderTestDatabase,
  type OrderTestDatabase,
} from '../../../test/support/order-database.builder.ts';
import { describeRestaurantMenuRepositoryContract } from '../../../test/support/restaurant-menu-repository.contract.ts';
import { PostgresRestaurantMenuRepository } from './postgres-restaurant-menu.repository.ts';

let testDatabase: OrderTestDatabase;

beforeAll(async () => {
  testDatabase = await startOrderTestDatabase();
});

afterAll(async () => {
  await testDatabase.stop();
});

describeRestaurantMenuRepositoryContract(
  'postgres',
  () => new PostgresRestaurantMenuRepository(testDatabase.database),
);
