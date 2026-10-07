import type { DomainEvent } from '@fd/domain';
import type { OrderId } from './order-id.value-object.ts';
import type { RestaurantId } from './restaurant-id.value-object.ts';
import type { TicketId } from './ticket-id.value-object.ts';

export interface TicketPreparationStarted extends DomainEvent {
  readonly eventType: 'TicketPreparationStarted';
  readonly ticketId: TicketId;
  readonly orderId: OrderId;
  readonly restaurantId: RestaurantId;
}
