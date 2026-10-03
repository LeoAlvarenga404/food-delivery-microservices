import type { OrderId } from '#domain/ticket/order-id.value-object.ts';
import type { TicketId } from '#domain/ticket/ticket-id.value-object.ts';

export interface TicketReply {
  readonly type: 'TicketCreated' | 'TicketApproved';
  readonly orderId: OrderId;
  readonly ticketId: TicketId;
}

export interface TicketCreationFailedReply {
  readonly type: 'TicketCreationFailed';
  readonly orderId: OrderId;
  readonly reason: 'EmptyTicket' | 'InvalidQuantity';
}

export interface TicketRejectedReply {
  readonly type: 'TicketRejected';
  readonly orderId: OrderId;
}

export type KitchenReply = TicketReply | TicketCreationFailedReply | TicketRejectedReply;

export interface ReplySender {
  send(reply: KitchenReply, sagaId: string): void;
}
