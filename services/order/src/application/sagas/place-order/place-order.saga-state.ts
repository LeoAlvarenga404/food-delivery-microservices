import type { RestaurantId } from '#domain/menu/restaurant-id.value-object.ts';
import type { Currency } from '#domain/money/money.value-object.ts';
import type { ConsumerId } from '#domain/order/consumer-id.value-object.ts';
import type { OrderId } from '#domain/order/order-id.value-object.ts';
import type { OrderLineItemSnapshot } from '#domain/order/order-line-item.entity.ts';

export interface PlaceOrderSagaOrder {
  readonly orderId: OrderId;
  readonly consumerId: ConsumerId;
  readonly restaurantId: RestaurantId;
  readonly lineItems: readonly OrderLineItemSnapshot[];
  readonly totalInCents: bigint;
  readonly currency: Currency;
  readonly paymentToken: string;
}

export type PlaceOrderSagaStep =
  | 'VERIFYING_CONSUMER'
  | 'CREATING_TICKET'
  | 'AUTHORIZING_PAYMENT'
  | 'APPROVING_TICKET'
  | 'COMPLETED';

export interface PlaceOrderSagaState {
  readonly step: PlaceOrderSagaStep;
  readonly order: PlaceOrderSagaOrder;
}

export interface PlaceOrderSagaInstance {
  readonly sagaId: string;
  readonly state: PlaceOrderSagaState;
  readonly version: number;
}
