import type { OrderId } from './order-id.value-object.ts';
import type { RestaurantId } from './restaurant-id.value-object.ts';
import type { Ticket } from './ticket.aggregate.ts';
import type { TicketId } from './ticket-id.value-object.ts';

export interface TicketRepository {
  findById(ticketId: TicketId): Promise<Ticket | undefined>;
  findByOrderId(orderId: OrderId): Promise<Ticket | undefined>;
  findActiveByRestaurantId(restaurantId: RestaurantId): Promise<readonly Ticket[]>;
  save(ticket: Ticket): Promise<void>;
}
