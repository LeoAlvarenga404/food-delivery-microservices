import type { OrderId } from './order-id.value-object.ts';
import type { TicketId } from './ticket-id.value-object.ts';
import type { TicketStatus } from './ticket.state.ts';

export interface EmptyTicket {
  readonly type: 'EmptyTicket';
  readonly orderId: OrderId;
}

export interface InvalidQuantity {
  readonly type: 'InvalidQuantity';
  readonly menuItemId: string;
  readonly quantity: number;
}

export type TicketCreationError = EmptyTicket | InvalidQuantity;

export interface InvalidTicketTransition {
  readonly type: 'InvalidTicketTransition';
  readonly ticketId: TicketId;
  readonly from: TicketStatus;
  readonly to: TicketStatus;
}
