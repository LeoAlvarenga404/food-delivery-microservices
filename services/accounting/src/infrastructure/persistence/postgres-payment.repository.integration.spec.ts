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
    { problem: 'a zero amount', amountInCents: 0, deliveryFeeInCents: 0, currency: 'BRL' },
    {
      problem: 'a currency other than BRL',
      amountInCents: 9800,
      deliveryFeeInCents: 800,
      currency: 'USD',
    },
    {
      problem: 'a negative delivery fee',
      amountInCents: 9800,
      deliveryFeeInCents: -1,
      currency: 'BRL',
    },
    {
      problem: 'a delivery fee that leaves nothing for the food',
      amountInCents: 9800,
      deliveryFeeInCents: 9800,
      currency: 'BRL',
    },
  ])('rejects $problem', async ({ amountInCents, deliveryFeeInCents, currency }) => {
    const insertion = sql`
      insert into payments (
        payment_id, order_id, consumer_id, restaurant_id, amount_in_cents,
        delivery_fee_in_cents, currency, gateway_authorization_id, status, authorized_at, version
      )
      values (
        '0199a5d0-0000-7000-8000-0000000000a1',
        '0199a5d0-0000-7000-8000-0000000000a2',
        '0199a5d0-0000-7000-8000-0000000000a3',
        '0199a5d0-0000-7000-8000-000000000001',
        ${amountInCents},
        ${deliveryFeeInCents},
        ${currency},
        'authorization-1',
        'AUTHORIZED',
        now(),
        1
      )
    `.execute(testDatabase.database);

    await expect(insertion).rejects.toMatchObject({ code: '23514' });
  });

  it.each([
    { problem: 'a voided payment without its void time', voidColumns: `'VOIDED', null, 'void-1'` },
    {
      problem: 'a voided payment without its gateway reference',
      voidColumns: `'VOIDED', now(), null`,
    },
    {
      problem: 'an authorized payment with a void time',
      voidColumns: `'AUTHORIZED', now(), 'void-1'`,
    },
    { problem: 'a status outside the lifecycle', voidColumns: `'CAPTURED', null, null` },
  ])('rejects $problem', async ({ voidColumns }) => {
    const insertion = sql`
      insert into payments (
        payment_id, order_id, consumer_id, restaurant_id, amount_in_cents,
        delivery_fee_in_cents, currency, gateway_authorization_id, authorized_at, version,
        status, voided_at, gateway_void_id
      )
      values (
        '0199a5d0-0000-7000-8000-0000000000a1',
        '0199a5d0-0000-7000-8000-0000000000a2',
        '0199a5d0-0000-7000-8000-0000000000a3',
        '0199a5d0-0000-7000-8000-000000000001',
        9800,
        800,
        'BRL',
        'authorization-1',
        now(),
        1,
        ${sql.raw(voidColumns)}
      )
    `.execute(testDatabase.database);

    await expect(insertion).rejects.toMatchObject({ code: '23514' });
  });
});
