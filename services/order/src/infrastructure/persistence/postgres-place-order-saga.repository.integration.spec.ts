import { readFile } from 'node:fs/promises';
import { sql } from 'kysely';
import type { PlaceOrderSagaState } from '#application/sagas/place-order/place-order.saga-state.ts';
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
import { placeOrderSagaPersistenceMapper } from './place-order-saga.persistence-mapper.ts';
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

  it('moves the payment token of slice 1 rows out of the stored order', async () => {
    const sagas = new PostgresPlaceOrderSagaRepository(testDatabase.database);
    const insertSlice1Row = async (sagaId: string, state: PlaceOrderSagaState) => {
      const row = placeOrderSagaPersistenceMapper.toPersistence({ sagaId, state, version: 1 });
      await testDatabase.database
        .insertInto('sagaInstances')
        .values({ ...row, orderId: crypto.randomUUID() })
        .execute();
      await sql`update saga_instances
        set state = jsonb_set(state #- '{paymentToken}', '{order,paymentToken}', '"tok_visa_4242"')
        where saga_id = ${sagaId}`.execute(testDatabase.database);
    };
    const completedId = '0199a5d0-0000-7000-8000-0000000000c1';
    const creatingTicketId = '0199a5d0-0000-7000-8000-0000000000c2';
    await insertSlice1Row(completedId, {
      step: 'COMPLETED',
      order: buildSagaOrder(),
    });
    await insertSlice1Row(creatingTicketId, {
      step: 'CREATING_TICKET',
      order: buildSagaOrder(),
      paymentToken: 'tok_visa_4242',
    });
    const migrationSql = await readFile(
      new URL('./migrations/0008-move-payment-token-out-of-saga-order.sql', import.meta.url),
      'utf8',
    );

    await sql.raw(migrationSql).execute(testDatabase.database);

    const completedRow = await testDatabase.database
      .selectFrom('sagaInstances')
      .select('state')
      .where('sagaId', '=', completedId)
      .executeTakeFirstOrThrow();
    expect(JSON.stringify(completedRow.state)).not.toContain('tok_visa_4242');
    const creatingTicket = await sagas.findById(creatingTicketId);
    expect(creatingTicket?.state).toMatchObject({
      step: 'CREATING_TICKET',
      paymentToken: 'tok_visa_4242',
    });
  });
});
