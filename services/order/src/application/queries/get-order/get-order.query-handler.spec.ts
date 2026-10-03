import { left, right } from '@fd/domain';
import { describe, expect, it } from 'vitest';
import { InMemoryOrderRepository } from '../../../../test/support/in-memory-order.repository.ts';
import { buildOrder, orderInput, unwrap } from '../../../../test/support/order.builder.ts';
import { parseConsumerId } from '#domain/order/consumer-id.value-object.ts';
import { parseOrderId } from '#domain/order/order-id.value-object.ts';
import { GetOrderQueryHandler } from './get-order.query-handler.ts';

const owner = { consumerId: orderInput().consumerId };
const otherConsumer = {
  consumerId: unwrap(parseConsumerId('0199a5d0-0000-7000-8000-0000000000c2')),
};

describe('GetOrderQueryHandler', () => {
  it('returns the snapshot of an order to the consumer who placed it', async () => {
    const orders = new InMemoryOrderRepository();
    const order = buildOrder();
    await orders.save(order);

    const outcome = await new GetOrderQueryHandler(orders).execute({
      orderId: order.toSnapshot().orderId,
      principal: owner,
    });

    expect(outcome).toEqual(right({ ...order.toSnapshot(), version: 1 }));
  });

  it('reports the order of another consumer as not found', async () => {
    const orders = new InMemoryOrderRepository();
    const order = buildOrder();
    await orders.save(order);
    const { orderId } = order.toSnapshot();

    const outcome = await new GetOrderQueryHandler(orders).execute({
      orderId,
      principal: otherConsumer,
    });

    expect(outcome).toEqual(left({ type: 'OrderNotFound', orderId }));
  });

  it('reports an order that does not exist', async () => {
    const orderId = unwrap(parseOrderId('0199a5d0-0000-7000-8000-0000000000ff'));

    const outcome = await new GetOrderQueryHandler(new InMemoryOrderRepository()).execute({
      orderId,
      principal: owner,
    });

    expect(outcome).toEqual(left({ type: 'OrderNotFound', orderId }));
  });
});
