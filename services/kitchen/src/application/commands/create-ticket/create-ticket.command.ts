import type { MessageMetadata } from '#application/ports/unit-of-work.port.ts';
import type { OrderId } from '#domain/ticket/order-id.value-object.ts';
import type { TicketLineItem } from '#domain/ticket/ticket.aggregate.ts';

export interface CreateTicketCommand {
  readonly orderId: OrderId;
  readonly restaurantId: string;
  readonly lineItems: readonly TicketLineItem[];
  readonly sagaId: string;
  readonly metadata: MessageMetadata;
}
