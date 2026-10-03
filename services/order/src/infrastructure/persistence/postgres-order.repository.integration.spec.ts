import { sql } from 'kysely';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { buildOrder, unwrap } from '../../../test/support/order.builder.ts';
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

describe('postgres order repository rows', () => {
  it('stores the approved status, the approval time and the next version', async () => {
    const repository = new PostgresOrderRepository(testDatabase.database);
    const placed = buildOrder();
    await repository.save(placed);
    const stored = await repository.findById(placed.toSnapshot().orderId);
    if (stored === undefined) throw new Error('the placed order was not stored');
    const approvedAt = new Date('2026-10-02T12:00:05.000Z');
    unwrap(stored.approve(approvedAt));

    await repository.save(stored);

    const row = await testDatabase.database
      .selectFrom('orders')
      .select(['status', 'approvedAt', 'version'])
      .executeTakeFirstOrThrow();
    expect(row).toEqual({ status: 'APPROVED', approvedAt, version: 2 });
  });

  it('stores the rejected status, the rejection reason and the rejection time', async () => {
    const repository = new PostgresOrderRepository(testDatabase.database);
    const placed = buildOrder();
    await repository.save(placed);
    const stored = await repository.findById(placed.toSnapshot().orderId);
    if (stored === undefined) throw new Error('the placed order was not stored');
    const rejectedAt = new Date('2026-10-02T12:00:07.000Z');
    unwrap(stored.reject('CONSUMER_BLOCKED', rejectedAt));

    await repository.save(stored);

    const row = await testDatabase.database
      .selectFrom('orders')
      .select(['status', 'approvedAt', 'rejectedAt', 'rejectionReason', 'version'])
      .executeTakeFirstOrThrow();
    expect(row).toEqual({
      status: 'REJECTED',
      approvedAt: null,
      rejectedAt,
      rejectionReason: 'CONSUMER_BLOCKED',
      version: 2,
    });
  });

  it.each([
    {
      problem: 'a rejected order without a rejection time',
      rejection: `'REJECTED', null, 'PAYMENT_DECLINED'`,
    },
    { problem: 'a rejected order without a reason', rejection: `'REJECTED', now(), null` },
    {
      problem: 'a pending order with a rejection reason',
      rejection: `'APPROVAL_PENDING', null, 'PAYMENT_DECLINED'`,
    },
    {
      problem: 'a rejection reason outside the catalogue',
      rejection: `'REJECTED', now(), 'CARD_STOLEN'`,
    },
  ])('refuses $problem', async ({ rejection }) => {
    const insertion = sql`
      insert into orders (
        order_id, consumer_id, restaurant_id, total_in_cents, currency, delivery_street,
        delivery_number, delivery_city, delivery_postal_code, placed_at, version,
        status, rejected_at, rejection_reason
      ) values (
        '0199a5d0-0000-7000-8000-0000000000a9', '0199a5d0-0000-7000-8000-0000000000c1',
        '0199a5d0-0000-7000-8000-000000000001', 9800, 'BRL', 'Rua Augusta', '1500',
        'Sao Paulo', '01304-001', now(), 1, ${sql.raw(rejection)}
      )
    `.execute(testDatabase.database);

    await expect(insertion).rejects.toMatchObject({ code: '23514' });
  });
});
