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

describe('postgres idempotency key store cleanup', () => {
  it('deletes the keys reserved more than one day ago and keeps the others', async () => {
    const now = new Date('2026-10-03T12:00:00.000Z');
    const store = new PostgresIdempotencyKeyStore(testDatabase.database);
    const reserveAged = (idempotencyKey: string, ageInMilliseconds: number) =>
      store.reserve({
        ...firstReservation,
        idempotencyKey,
        createdAt: new Date(now.getTime() - ageInMilliseconds),
      });
    await reserveAged('checkout-expired', 86_400_001);
    await reserveAged('checkout-one-day-old', 86_400_000);
    await reserveAged('checkout-fresh', 1_000);

    const deletedCount = await store.deleteExpired(now);

    const remaining = await testDatabase.database
      .selectFrom('idempotencyKeys')
      .select('idempotencyKey')
      .orderBy('idempotencyKey')
      .execute();
    expect(deletedCount).toBe(1);
    expect(remaining.map((row) => row.idempotencyKey)).toEqual([
      'checkout-fresh',
      'checkout-one-day-old',
    ]);
  });
});
