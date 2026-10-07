import { ConcurrencyConflictError } from '@fd/chassis-postgres';
import { beforeEach, describe, expect, it } from 'vitest';
import type { Order } from '#domain/order/order.aggregate.ts';
import { parseOrderId, type OrderId } from '#domain/order/order-id.value-object.ts';
import type { OrderRepository } from '#domain/order/order.repository.ts';
import { buildOrder, unwrap } from './order.builder.ts';

const approvedAt = new Date('2026-10-02T12:00:05.000Z');
const rejectedAt = new Date('2026-10-02T12:00:07.000Z');

async function findStoredOrder(orders: OrderRepository, orderId: OrderId): Promise<Order> {
  const order = await orders.findById(orderId);
  if (order === undefined) throw new Error(`order ${orderId} was not stored`);
  return order;
}

export function describeOrderRepositoryContract(
  implementationName: string,
  createRepository: () => OrderRepository,
): void {
  describe(`${implementationName} order repository`, () => {
    const { orderId } = buildOrder().toSnapshot();
    let orders: OrderRepository;

    beforeEach(() => {
      orders = createRepository();
    });

    it('finds a saved order with its frozen line items, total and delivery address', async () => {
      const order = buildOrder();

      await orders.save(order);

      expect((await findStoredOrder(orders, orderId)).toSnapshot()).toEqual({
        ...order.toSnapshot(),
        version: 1,
      });
    });

    it('returns undefined for an order that was never saved', async () => {
      const unknownOrderId = unwrap(parseOrderId('0199a5d0-0000-7000-8000-0000000000ff'));

      expect(await orders.findById(unknownOrderId)).toBeUndefined();
    });

    it('saves the approval of a stored order and increments its version', async () => {
      await orders.save(buildOrder());
      const stored = await findStoredOrder(orders, orderId);
      unwrap(stored.approve(approvedAt));

      await orders.save(stored);
      const { state, version } = (await findStoredOrder(orders, orderId)).toSnapshot();

      expect(state).toEqual({ status: 'APPROVED', approvedAt });
      expect(version).toBe(2);
    });

    it('saves the rejection of a stored order with its reason', async () => {
      await orders.save(buildOrder());
      const stored = await findStoredOrder(orders, orderId);
      unwrap(stored.reject('PAYMENT_DECLINED', rejectedAt));

      await orders.save(stored);
      const { state, version } = (await findStoredOrder(orders, orderId)).toSnapshot();

      expect(state).toEqual({
        status: 'REJECTED',
        rejectionReason: 'PAYMENT_DECLINED',
        rejectedAt,
      });
      expect(version).toBe(2);
    });

    it('rejects a save based on a version another save already replaced', async () => {
      await orders.save(buildOrder());
      const first = await findStoredOrder(orders, orderId);
      const second = await findStoredOrder(orders, orderId);
      unwrap(first.approve(approvedAt));
      unwrap(second.approve(approvedAt));
      await orders.save(first);

      await expect(orders.save(second)).rejects.toThrow(ConcurrencyConflictError);
    });

    it('refuses a new order whose id is already stored as a concurrency conflict', async () => {
      await orders.save(buildOrder());

      await expect(orders.save(buildOrder())).rejects.toThrow(ConcurrencyConflictError);
    });
  });
}
