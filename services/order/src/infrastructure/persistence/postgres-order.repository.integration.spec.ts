import { afterAll, beforeAll, beforeEach } from 'vitest';
import {
  startOrderTestDatabase,
  type OrderTestDatabase,
} from '../../../test/support/order-database.builder.ts';
import { describeOrderRepositoryContract } from '../../../test/support/order-repository.contract.ts';
import { PostgresOrderRepository } from './postgres-order.repository.ts';

let testDatabase: OrderTestDatabase;

beforeAll(async () => {
  testDatabase = await startOrderTestDatabase();
});

beforeEach(async () => {
  await testDatabase.clearWrittenRows();
});

afterAll(async () => {
  await testDatabase.stop();
});

describeOrderRepositoryContract(
  'postgres',
  () => new PostgresOrderRepository(testDatabase.database),
);
