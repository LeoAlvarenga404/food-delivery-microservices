import { setTimeout as delay } from 'node:timers/promises';
import { runInTransaction } from '@fd/chassis-postgres';
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

    await delay(300);
    expect(isSecondSettled).toBe(false);
    firstMayCommit.resolve(undefined);

    expect(await first).toEqual(firstReservation);
    expect(await second).toEqual(firstReservation);
  });
});
