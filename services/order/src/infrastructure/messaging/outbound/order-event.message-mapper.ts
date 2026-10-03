import { create } from '@bufbuild/protobuf';
import { timestampFromDate } from '@bufbuild/protobuf/wkt';
import type { OutboxMessage } from '@fd/chassis-outbox';
import {
  OrderApprovedSchema,
  OrderPlacedSchema,
  type OrderApproved as OrderApprovedContract,
  type OrderPlaced as OrderPlacedContract,
} from '@fd/contracts/fooddelivery/order/v1/events_pb.js';
import type { OrderEvent } from '#domain/order/order.aggregate.ts';
import type { OrderApproved } from '#domain/order/order-approved.event.ts';
import type { OrderPlaced } from '#domain/order/order-placed.event.ts';
import { toOutboxMessage } from './outbox-message.message-mapper.ts';

const orderEventsTopic = 'order.order.events';

export function toOrderPlacedContract(event: OrderPlaced): OrderPlacedContract {
  return create(OrderPlacedSchema, {
    orderId: event.orderId,
    consumerId: event.consumerId,
    restaurantId: event.restaurantId,
    lineItems: event.lineItems.map(({ menuItemId, name, unitPriceInCents, quantity }) => ({
      menuItemId,
      name,
      unitPriceInCents,
      quantity,
    })),
    totalInCents: event.totalInCents,
    currency: event.currency,
    placedAt: timestampFromDate(event.occurredAt),
  });
}

export function toOrderApprovedContract(event: OrderApproved): OrderApprovedContract {
  return create(OrderApprovedSchema, {
    orderId: event.orderId,
    approvedAt: timestampFromDate(event.occurredAt),
  });
}

export function toOrderEventMessages(event: OrderEvent): readonly OutboxMessage[] {
  const routing = { topic: orderEventsTopic, orderId: event.orderId, sagaId: undefined };
  switch (event.eventType) {
    case 'OrderPlaced':
      return [toOutboxMessage(OrderPlacedSchema, toOrderPlacedContract(event), routing)];
    case 'OrderApproved':
      return [toOutboxMessage(OrderApprovedSchema, toOrderApprovedContract(event), routing)];
  }
}
