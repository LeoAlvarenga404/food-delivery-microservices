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
});
