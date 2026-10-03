import type { MessageMetadata } from '#application/ports/unit-of-work.port.ts';
import type { OrderId } from '#domain/ticket/order-id.value-object.ts';
import type { InvalidTicketTransition } from '#domain/ticket/ticket.errors.ts';

export interface ApproveTicketCommand {
  readonly orderId: OrderId;
  readonly sagaId: string;
  readonly metadata: MessageMetadata;
}

export interface TicketNotFound {
  readonly type: 'TicketNotFound';
  readonly orderId: OrderId;
}

export type ApproveTicketError = TicketNotFound | InvalidTicketTransition;
