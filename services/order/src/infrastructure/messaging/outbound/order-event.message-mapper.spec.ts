import { fromBinary } from '@bufbuild/protobuf';
import {
  OrderPlacedSchema,
  OrderRejectedSchema,
  OrderRejectionReason as ContractRejectionReason,
} from '@fd/contracts/fooddelivery/order/v1/events_pb.js';
import { describe, expect, it } from 'vitest';
import { buildOrder, unwrap } from '../../../../test/support/order.builder.ts';
import type { OrderEvent } from '#domain/order/order.aggregate.ts';
import type { OrderRejectionReason } from '#domain/order/order.state.ts';
import {
  toContractRejectionReason,
  toOrderEventMessages,
  toOrderPlacedContract,
} from './order-event.message-mapper.ts';

const rejectedAt = new Date('2026-10-02T12:00:07.000Z');

function recordedEventsOfAnApprovedOrder(): readonly OrderEvent[] {
  const order = buildOrder();
  unwrap(order.approve(new Date('2026-10-02T12:00:05.000Z')));
  return order.pullRecordedEvents();
}

describe('toOrderEventMessages', () => {
  it('publishes each order event on order.order.events keyed by the order id', () => {
    const messages = recordedEventsOfAnApprovedOrder().flatMap(toOrderEventMessages);

    expect(messages).toMatchObject([
      {
        topic: 'order.order.events',
        aggregateType: 'Order',
        aggregateId: '0199a5d0-0000-7000-8000-0000000000a1',
        messageType: 'fooddelivery.order.v1.OrderPlaced',
        sagaId: undefined,
      },
      {
        topic: 'order.order.events',
        aggregateType: 'Order',
        aggregateId: '0199a5d0-0000-7000-8000-0000000000a1',
        messageType: 'fooddelivery.order.v1.OrderApproved',
        sagaId: undefined,
      },
    ]);
  });

  it('carries the Protobuf payload of the event', () => {
    const [placed] = buildOrder().pullRecordedEvents();
    if (placed?.eventType !== 'OrderPlaced') throw new Error('expected OrderPlaced');

    const [message] = toOrderEventMessages(placed);

    expect(fromBinary(OrderPlacedSchema, message?.payload ?? new Uint8Array())).toEqual(
      toOrderPlacedContract(placed),
    );
  });

  it('publishes OrderPlaced with the delivery fee and the total that includes it', () => {
    const [placed] = buildOrder({ deliveryFeeInCents: 1200n }).pullRecordedEvents();
    if (placed?.eventType !== 'OrderPlaced') throw new Error('expected OrderPlaced');

    expect(toOrderPlacedContract(placed)).toMatchObject({
      deliveryFeeInCents: 1200n,
      totalInCents: 11000n,
    });
  });

  it('publishes OrderRejected with its reason and rejection time', () => {
    const order = buildOrder();
    order.pullRecordedEvents();
    unwrap(order.reject('PAYMENT_DECLINED', rejectedAt));

    const [message, ...others] = order.pullRecordedEvents().flatMap(toOrderEventMessages);

    expect(others).toEqual([]);
    expect(message).toMatchObject({
      topic: 'order.order.events',
      aggregateId: '0199a5d0-0000-7000-8000-0000000000a1',
      messageType: 'fooddelivery.order.v1.OrderRejected',
    });
    expect(fromBinary(OrderRejectedSchema, message?.payload ?? new Uint8Array())).toMatchObject({
      orderId: '0199a5d0-0000-7000-8000-0000000000a1',
      reason: ContractRejectionReason.PAYMENT_DECLINED,
      rejectedAt: { seconds: BigInt(rejectedAt.getTime() / 1000) },
    });
  });
});

describe('toContractRejectionReason', () => {
  it.each<[OrderRejectionReason, ContractRejectionReason]>([
    ['CONSUMER_NOT_FOUND', ContractRejectionReason.CONSUMER_NOT_FOUND],
    ['CONSUMER_BLOCKED', ContractRejectionReason.CONSUMER_BLOCKED],
    ['TICKET_REFUSED', ContractRejectionReason.TICKET_REFUSED],
    ['PAYMENT_DECLINED', ContractRejectionReason.PAYMENT_DECLINED],
    ['CONSUMER_VERIFICATION_TIMED_OUT', ContractRejectionReason.CONSUMER_VERIFICATION_TIMED_OUT],
    ['TICKET_CREATION_TIMED_OUT', ContractRejectionReason.TICKET_CREATION_TIMED_OUT],
    ['PAYMENT_AUTHORIZATION_TIMED_OUT', ContractRejectionReason.PAYMENT_AUTHORIZATION_TIMED_OUT],
  ])('maps %s to its contract value', (reason, contractReason) => {
    expect(toContractRejectionReason(reason)).toBe(contractReason);
  });
});
