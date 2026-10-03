import { create } from '@bufbuild/protobuf';
import { timestampFromDate } from '@bufbuild/protobuf/wkt';
import type { OutboxMessage } from '@fd/chassis-outbox';
import {
  OrderApprovedSchema,
  OrderPlacedSchema,
  OrderRejectedSchema,
  OrderRejectionReason as ContractRejectionReason,
  type OrderApproved as OrderApprovedContract,
  type OrderPlaced as OrderPlacedContract,
  type OrderRejected as OrderRejectedContract,
} from '@fd/contracts/fooddelivery/order/v1/events_pb.js';
import type { OrderEvent } from '#domain/order/order.aggregate.ts';
import type { OrderApproved } from '#domain/order/order-approved.event.ts';
import type { OrderPlaced } from '#domain/order/order-placed.event.ts';
import type { OrderRejected } from '#domain/order/order-rejected.event.ts';
import type { OrderRejectionReason } from '#domain/order/order.state.ts';
import { toOutboxMessage } from './outbox-message.message-mapper.ts';

const orderEventsTopic = 'order.order.events';

const contractRejectionReasons: Readonly<Record<OrderRejectionReason, ContractRejectionReason>> = {
  CONSUMER_NOT_FOUND: ContractRejectionReason.CONSUMER_NOT_FOUND,
  CONSUMER_BLOCKED: ContractRejectionReason.CONSUMER_BLOCKED,
  TICKET_REFUSED: ContractRejectionReason.TICKET_REFUSED,
  PAYMENT_DECLINED: ContractRejectionReason.PAYMENT_DECLINED,
  CONSUMER_VERIFICATION_TIMED_OUT: ContractRejectionReason.CONSUMER_VERIFICATION_TIMED_OUT,
  TICKET_CREATION_TIMED_OUT: ContractRejectionReason.TICKET_CREATION_TIMED_OUT,
  PAYMENT_AUTHORIZATION_TIMED_OUT: ContractRejectionReason.PAYMENT_AUTHORIZATION_TIMED_OUT,
};

export function toContractRejectionReason(reason: OrderRejectionReason): ContractRejectionReason {
  return contractRejectionReasons[reason];
}

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

export function toOrderRejectedContract(event: OrderRejected): OrderRejectedContract {
  return create(OrderRejectedSchema, {
    orderId: event.orderId,
    reason: toContractRejectionReason(event.rejectionReason),
    rejectedAt: timestampFromDate(event.occurredAt),
  });
}

export function toOrderEventMessages(event: OrderEvent): readonly OutboxMessage[] {
  const routing = { topic: orderEventsTopic, orderId: event.orderId, sagaId: undefined };
  switch (event.eventType) {
    case 'OrderPlaced':
      return [toOutboxMessage(OrderPlacedSchema, toOrderPlacedContract(event), routing)];
    case 'OrderApproved':
      return [toOutboxMessage(OrderApprovedSchema, toOrderApprovedContract(event), routing)];
    case 'OrderRejected':
      return [toOutboxMessage(OrderRejectedSchema, toOrderRejectedContract(event), routing)];
  }
}
