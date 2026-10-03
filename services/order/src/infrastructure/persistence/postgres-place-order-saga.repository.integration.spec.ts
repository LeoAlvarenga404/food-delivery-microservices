import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import {
  buildSagaInstance,
  buildSagaOrder,
} from '../../../test/support/place-order-saga.builder.ts';
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
    await sagas.save({ ...stored, state: { step: 'COMPLETED', order: buildSagaOrder() } });

    expect(await readRow()).toEqual({ step: 'COMPLETED', status: 'COMPLETED' });
  });

  it('stores a compensated saga with the COMPENSATED status', async () => {
    const sagas = new PostgresPlaceOrderSagaRepository(testDatabase.database);
    const started = buildSagaInstance();
    await sagas.save(started);
    const stored = await sagas.findById(started.sagaId);
    if (stored === undefined) throw new Error('the saga was not stored');

    await sagas.save({
      ...stored,
      state: { step: 'COMPENSATED', order: buildSagaOrder(), rejectionReason: 'CONSUMER_BLOCKED' },
    });

    const row = await testDatabase.database
      .selectFrom('sagaInstances')
      .select(['step', 'status'])
      .executeTakeFirstOrThrow();
    expect(row).toEqual({ step: 'COMPENSATED', status: 'COMPENSATED' });
  });

  it('keeps the payment token in the stored state only until the saga leaves the payment step', async () => {
    const sagas = new PostgresPlaceOrderSagaRepository(testDatabase.database);
    const started = buildSagaInstance();
    const readStoredState = async () => {
      const row = await testDatabase.database
        .selectFrom('sagaInstances')
        .select('state')
        .executeTakeFirstOrThrow();
      return JSON.stringify(row.state);
    };

    await sagas.save(started);
    expect(await readStoredState()).toContain('tok_visa_4242');

    const stored = await sagas.findById(started.sagaId);
    if (stored === undefined) throw new Error('the saga was not stored');
    await sagas.save({ ...stored, state: { step: 'APPROVING_TICKET', order: buildSagaOrder() } });

    expect(await readStoredState()).not.toContain('tok_visa_4242');
  });
});
