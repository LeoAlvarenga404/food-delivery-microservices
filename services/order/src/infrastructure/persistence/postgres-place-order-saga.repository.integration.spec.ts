import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { buildSagaInstance } from '../../../test/support/place-order-saga.builder.ts';
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

describe('postgres place order saga repository rows', () => {
  it('stores the step and a status that follows it on insert and on update', async () => {
    const sagas = new PostgresPlaceOrderSagaRepository(testDatabase.database);
    const started = buildSagaInstance();
    const readRow = () =>
      testDatabase.database
        .selectFrom('sagaInstances')
        .select(['step', 'status'])
        .executeTakeFirstOrThrow();

    await sagas.save(started);
    expect(await readRow()).toEqual({ step: 'VERIFYING_CONSUMER', status: 'RUNNING' });

    const stored = await sagas.findById(started.sagaId);
    if (stored === undefined) throw new Error('the saga was not stored');
    await sagas.save({ ...stored, state: { ...stored.state, step: 'COMPLETED' } });

    expect(await readRow()).toEqual({ step: 'COMPLETED', status: 'COMPLETED' });
  });
});
