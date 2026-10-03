import type { OrderId } from '#domain/ticket/order-id.value-object.ts';
import type { TicketId } from '#domain/ticket/ticket-id.value-object.ts';

export interface KitchenReply {
  readonly type: 'TicketCreated' | 'TicketApproved';
  readonly orderId: OrderId;
  readonly ticketId: TicketId;
}

export interface ReplySender {
  send(reply: KitchenReply, sagaId: string): void;
}
