import { create, toBinary, type DescMessage, type MessageShape } from '@bufbuild/protobuf';
import type { OutboxMessage } from '@fd/chassis-outbox';
import {
  TicketApprovedSchema,
  TicketCreatedSchema,
  TicketCreationFailedSchema,
  TicketCreationFailureReason,
  TicketRejectedSchema,
  type TicketApproved,
  type TicketCreated,
  type TicketCreationFailed,
  type TicketRejected,
} from '@fd/contracts/fooddelivery/kitchen/v1/replies_pb.js';
import type {
  KitchenReply,
  TicketCreationFailedReply,
  TicketRejectedReply,
  TicketReply,
} from '#application/ports/reply-sender.port.ts';

function toFailureReason(reason: TicketCreationFailedReply['reason']): TicketCreationFailureReason {
  switch (reason) {
    case 'EmptyTicket':
      return TicketCreationFailureReason.EMPTY_TICKET;
    case 'InvalidQuantity':
      return TicketCreationFailureReason.INVALID_QUANTITY;
  }
}

export function toTicketCreated(reply: TicketReply): TicketCreated {
  return create(TicketCreatedSchema, { orderId: reply.orderId, ticketId: reply.ticketId });
}

export function toTicketApproved(reply: TicketReply): TicketApproved {
  return create(TicketApprovedSchema, { orderId: reply.orderId, ticketId: reply.ticketId });
}

export function toTicketCreationFailed(reply: TicketCreationFailedReply): TicketCreationFailed {
  return create(TicketCreationFailedSchema, {
    orderId: reply.orderId,
    reason: toFailureReason(reply.reason),
  });
}

export function toTicketRejected(reply: TicketRejectedReply): TicketRejected {
  return create(TicketRejectedSchema, { orderId: reply.orderId });
}

function toReplyMessage<Schema extends DescMessage>(
  schema: Schema,
  payload: MessageShape<Schema>,
  sagaId: string,
): OutboxMessage {
  return {
    topic: 'order.place-order-saga.replies',
    aggregateType: 'PlaceOrderSaga',
    aggregateId: sagaId,
    messageType: schema.typeName,
    payload: toBinary(schema, payload),
    sagaId,
  };
}

export function toKitchenReplyMessage(reply: KitchenReply, sagaId: string): OutboxMessage {
  switch (reply.type) {
    case 'TicketCreated':
      return toReplyMessage(TicketCreatedSchema, toTicketCreated(reply), sagaId);
    case 'TicketApproved':
      return toReplyMessage(TicketApprovedSchema, toTicketApproved(reply), sagaId);
    case 'TicketCreationFailed':
      return toReplyMessage(TicketCreationFailedSchema, toTicketCreationFailed(reply), sagaId);
    case 'TicketRejected':
      return toReplyMessage(TicketRejectedSchema, toTicketRejected(reply), sagaId);
  }
}
