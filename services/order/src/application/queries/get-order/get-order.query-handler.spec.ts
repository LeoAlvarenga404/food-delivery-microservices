import { left, right } from '@fd/domain';
import { describe, expect, it } from 'vitest';
import { InMemoryOrderRepository } from '../../../../test/support/in-memory-order.repository.ts';
import { buildOrder, unwrap } from '../../../../test/support/order.builder.ts';
import { parseOrderId } from '#domain/order/order-id.value-object.ts';
import { GetOrderQueryHandler } from './get-order.query-handler.ts';

describe('GetOrderQueryHandler', () => {
  it('returns the snapshot of a stored order', async () => {
    const orders = new InMemoryOrderRepository();
    const order = buildOrder();
    await orders.save(order);

    const outcome = await new GetOrderQueryHandler(orders).execute({
      orderId: order.toSnapshot().orderId,
    });

    expect(outcome).toEqual(right({ ...order.toSnapshot(), version: 1 }));
  });

  it('reports an order that does not exist', async () => {
    const orderId = unwrap(parseOrderId('0199a5d0-0000-7000-8000-0000000000ff'));

    const outcome = await new GetOrderQueryHandler(new InMemoryOrderRepository()).execute({
      orderId,
    });

    expect(outcome).toEqual(left({ type: 'OrderNotFound', orderId }));
  });
});
