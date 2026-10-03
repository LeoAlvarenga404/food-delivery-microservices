import { create, toBinary, type DescMessage, type MessageShape } from '@bufbuild/protobuf';
import type { OutboxMessage } from '@fd/chassis-outbox';
import {
  TicketApprovedSchema,
  TicketCreatedSchema,
  type TicketApproved,
  type TicketCreated,
} from '@fd/contracts/fooddelivery/kitchen/v1/replies_pb.js';
import type { KitchenReply } from '#application/ports/reply-sender.port.ts';

export function toTicketCreated(reply: KitchenReply): TicketCreated {
  return create(TicketCreatedSchema, { orderId: reply.orderId, ticketId: reply.ticketId });
}

export function toTicketApproved(reply: KitchenReply): TicketApproved {
  return create(TicketApprovedSchema, { orderId: reply.orderId, ticketId: reply.ticketId });
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
  }
}
