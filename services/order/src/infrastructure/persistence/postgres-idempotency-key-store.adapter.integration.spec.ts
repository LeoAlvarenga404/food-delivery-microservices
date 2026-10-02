import { setTimeout as delay } from 'node:timers/promises';
import { runInTransaction } from '@fd/chassis-postgres';
import { sql } from 'kysely';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import {
  describeIdempotencyKeyStoreContract,
  firstReservation,
  repeatedReservation,
} from '../../../test/support/idempotency-key-store.contract.ts';
import {
  startOrderTestDatabase,
  type OrderTestDatabase,
} from '../../../test/support/order-database.builder.ts';
import { PostgresIdempotencyKeyStore } from './postgres-idempotency-key-store.adapter.ts';

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

describeIdempotencyKeyStoreContract(
  'postgres',
  () => new PostgresIdempotencyKeyStore(testDatabase.database),
);

async function waitForBlockedInsert(): Promise<void> {
  const deadline = Date.now() + 5_000;
  while (Date.now() < deadline) {
    const blocked = await sql`
      select 1 from pg_stat_activity
      where wait_event_type = 'Lock' and query ilike '%insert into%idempotency_keys%'
    `.execute(testDatabase.database);
    if (blocked.rows.length > 0) return;
    await delay(25);
  }
  throw new Error('no session waited for the idempotency key lock within 5 seconds');
}

describe('postgres idempotency key store under concurrency', () => {
  it('makes a racing reservation of the same key wait for the first transaction and return its reservation', async () => {
    const firstReserved = Promise.withResolvers<undefined>();
    const firstMayCommit = Promise.withResolvers<undefined>();
    const first = runInTransaction(testDatabase.database, async (transaction) => {
      const reserved = await new PostgresIdempotencyKeyStore(transaction).reserve(firstReservation);
      firstReserved.resolve(undefined);
      await firstMayCommit.promise;
      return reserved;
    });
    await firstReserved.promise;
    let isSecondSettled = false;
    const second = runInTransaction(testDatabase.database, (transaction) =>
      new PostgresIdempotencyKeyStore(transaction).reserve(repeatedReservation),
    ).finally(() => {
      isSecondSettled = true;
    });

    await waitForBlockedInsert();
    expect(isSecondSettled).toBe(false);
    firstMayCommit.resolve(undefined);

    expect(await first).toEqual(firstReservation);
    expect(await second).toEqual(firstReservation);
  });

  it('lets a racing reservation take over the key when the first transaction rolls back', async () => {
    const firstReserved = Promise.withResolvers<undefined>();
    const firstMayRollBack = Promise.withResolvers<undefined>();
    const first = runInTransaction(testDatabase.database, async (transaction) => {
      await new PostgresIdempotencyKeyStore(transaction).reserve(firstReservation);
      firstReserved.resolve(undefined);
      await firstMayRollBack.promise;
      throw new Error('the first placement failed');
    });
    const firstOutcome = expect(first).rejects.toThrow('the first placement failed');
    await firstReserved.promise;
    const second = runInTransaction(testDatabase.database, (transaction) =>
      new PostgresIdempotencyKeyStore(transaction).reserve(repeatedReservation),
    );

    await waitForBlockedInsert();
    firstMayRollBack.resolve(undefined);

    await firstOutcome;
    expect(await second).toEqual(repeatedReservation);
    const rows = await testDatabase.database.selectFrom('idempotencyKeys').selectAll().execute();
    expect(rows.map((row) => row.orderId)).toEqual([repeatedReservation.orderId]);
  });
});
