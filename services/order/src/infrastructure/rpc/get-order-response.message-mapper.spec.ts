import { OrderRejectionReason } from '@fd/contracts/fooddelivery/order/v1/events_pb.js';
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
      rejectionReason: OrderRejectionReason.UNSPECIFIED,
      totalInCents: 9007199254740993n,
      currency: 'BRL',
      lineItems: [
        { name: 'Margherita', unitPriceInCents: 4500n, quantity: 2 },
        { name: 'Guarana', unitPriceInCents: 800n, quantity: 1 },
      ],
    });
  });

  it('maps a rejected order to the REJECTED status and the reason it was rejected for', () => {
    const order = buildOrder();
    unwrap(order.reject('PAYMENT_DECLINED', new Date('2026-10-02T12:00:07.000Z')));

    expect(toGetOrderResponse(order.toSnapshot())).toMatchObject({
      status: OrderStatus.REJECTED,
      rejectionReason: OrderRejectionReason.PAYMENT_DECLINED,
    });
  });
});
