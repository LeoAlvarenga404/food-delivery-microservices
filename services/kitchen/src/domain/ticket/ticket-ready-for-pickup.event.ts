import type { DomainEvent } from '@fd/domain';
import type { OrderId } from './order-id.value-object.ts';
import type { RestaurantId } from './restaurant-id.value-object.ts';
import type { TicketId } from './ticket-id.value-object.ts';

export interface TicketReadyForPickup extends DomainEvent {
  readonly eventType: 'TicketReadyForPickup';
  readonly ticketId: TicketId;
  readonly orderId: OrderId;
  readonly restaurantId: RestaurantId;
}
