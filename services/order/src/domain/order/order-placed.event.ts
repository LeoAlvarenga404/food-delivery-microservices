import type { DomainEvent } from '@fd/domain';
import type { RestaurantId } from '#domain/menu/restaurant-id.value-object.ts';
import type { Currency } from '#domain/money/money.value-object.ts';
import type { ConsumerId } from './consumer-id.value-object.ts';
import type { OrderId } from './order-id.value-object.ts';
import type { OrderLineItemSnapshot } from './order-line-item.entity.ts';

export interface OrderPlaced extends DomainEvent {
  readonly eventType: 'OrderPlaced';
  readonly orderId: OrderId;
  readonly consumerId: ConsumerId;
  readonly restaurantId: RestaurantId;
  readonly lineItems: readonly OrderLineItemSnapshot[];
  readonly totalInCents: bigint;
  readonly currency: Currency;
}
