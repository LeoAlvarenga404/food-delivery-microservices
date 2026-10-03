import { sql } from 'kysely';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import {
  startAccountingTestDatabase,
  type AccountingTestDatabase,
} from '../../../test/support/accounting-database.builder.ts';
import { describePaymentRepositoryContract } from '../../../test/support/payment-repository.contract.ts';
import { PostgresPaymentRepository } from './postgres-payment.repository.ts';

let testDatabase: AccountingTestDatabase;

beforeAll(async () => {
  testDatabase = await startAccountingTestDatabase();
});

beforeEach(async () => {
  await testDatabase.clearWrittenRows();
});

afterAll(async () => {
  await testDatabase.stop();
});

describePaymentRepositoryContract(
  'postgres',
  () => new PostgresPaymentRepository(testDatabase.database),
);

describe('postgres payments table', () => {
  it.each([
    { problem: 'a zero amount', amountInCents: 0, currency: 'BRL' },
    { problem: 'a currency other than BRL', amountInCents: 9800, currency: 'USD' },
  ])('rejects $problem', async ({ amountInCents, currency }) => {
    const insertion = sql`
      insert into payments (
        payment_id, order_id, consumer_id, amount_in_cents, currency,
        gateway_authorization_id, status, authorized_at, version
      )
      values (
        '0199a5d0-0000-7000-8000-0000000000a1',
        '0199a5d0-0000-7000-8000-0000000000a2',
        '0199a5d0-0000-7000-8000-0000000000a3',
        ${amountInCents},
        ${currency},
        'authorization-1',
        'AUTHORIZED',
        now(),
        1
      )
    `.execute(testDatabase.database);

    await expect(insertion).rejects.toMatchObject({ code: '23514' });
  });
});
