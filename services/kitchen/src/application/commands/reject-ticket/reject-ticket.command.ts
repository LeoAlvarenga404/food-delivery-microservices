import type { MessageMetadata } from '#application/ports/unit-of-work.port.ts';
import type { OrderId } from '#domain/ticket/order-id.value-object.ts';
import type { InvalidTicketTransition } from '#domain/ticket/ticket.errors.ts';

export interface RejectTicketCommand {
  readonly orderId: OrderId;
  readonly sagaId: string;
  readonly metadata: MessageMetadata;
}

export type RejectTicketError = InvalidTicketTransition;
