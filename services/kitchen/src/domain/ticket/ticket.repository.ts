import type { OrderId } from './order-id.value-object.ts';
import type { Ticket } from './ticket.aggregate.ts';

export interface TicketRepository {
  findByOrderId(orderId: OrderId): Promise<Ticket | undefined>;
  save(ticket: Ticket): Promise<void>;
}
