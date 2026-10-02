import { fromBinary } from '@bufbuild/protobuf';
import { OrderPlacedSchema } from '@fd/contracts/fooddelivery/order/v1/events_pb.js';
import { describe, expect, it } from 'vitest';
import { buildOrder, unwrap } from '../../../../test/support/order.builder.ts';
import type { OrderEvent } from '#domain/order/order.aggregate.ts';
import { toOrderEventMessages, toOrderPlacedContract } from './order-event.message-mapper.ts';

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
});
