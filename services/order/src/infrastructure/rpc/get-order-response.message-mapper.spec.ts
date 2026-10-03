import { OrderStatus } from '@fd/contracts/fooddelivery/order/v1/service_pb.js';
import { describe, expect, it } from 'vitest';
import { buildOrder, unwrap } from '../../../test/support/order.builder.ts';
import { toGetOrderResponse } from './get-order-response.message-mapper.ts';

describe('toGetOrderResponse', () => {
  it('maps an approved order with a total beyond the safe integer range', () => {
    const order = buildOrder();
    unwrap(order.approve(new Date('2026-10-02T12:00:05.000Z')));
    const snapshot = { ...order.toSnapshot(), totalInCents: 9007199254740993n };

    expect(toGetOrderResponse(snapshot)).toMatchObject({
      orderId: snapshot.orderId,
      status: OrderStatus.APPROVED,
      totalInCents: 9007199254740993n,
      currency: 'BRL',
      lineItems: [
        { name: 'Margherita', unitPriceInCents: 4500n, quantity: 2 },
        { name: 'Guarana', unitPriceInCents: 800n, quantity: 1 },
      ],
    });
  });
});
