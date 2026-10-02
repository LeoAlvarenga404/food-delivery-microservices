import { afterAll, beforeAll, beforeEach } from 'vitest';
import {
  startOrderTestDatabase,
  type OrderTestDatabase,
} from '../../../test/support/order-database.builder.ts';
import { describePlaceOrderSagaRepositoryContract } from '../../../test/support/place-order-saga-repository.contract.ts';
import { PostgresPlaceOrderSagaRepository } from './postgres-place-order-saga.repository.ts';

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

describePlaceOrderSagaRepositoryContract(
  'postgres',
  () => new PostgresPlaceOrderSagaRepository(testDatabase.database),
);
