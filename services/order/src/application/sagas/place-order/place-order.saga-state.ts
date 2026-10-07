import type { RestaurantId } from '#domain/menu/restaurant-id.value-object.ts';
import type { Currency } from '#domain/money/money.value-object.ts';
import type { ConsumerId } from '#domain/order/consumer-id.value-object.ts';
import type { OrderId } from '#domain/order/order-id.value-object.ts';
import type { OrderLineItemSnapshot } from '#domain/order/order-line-item.entity.ts';
import type { OrderRejectionReason } from '#domain/order/order.state.ts';

export interface PlaceOrderSagaOrder {
  readonly orderId: OrderId;
  readonly consumerId: ConsumerId;
  readonly restaurantId: RestaurantId;
  readonly lineItems: readonly OrderLineItemSnapshot[];
  readonly deliveryFeeInCents: bigint;
  readonly totalInCents: bigint;
  readonly currency: Currency;
}

export interface BeforePivotSagaState {
  readonly step: 'VERIFYING_CONSUMER' | 'CREATING_TICKET' | 'AUTHORIZING_PAYMENT';
  readonly order: PlaceOrderSagaOrder;
  readonly paymentToken: string;
}

export interface AfterPivotSagaState {
  readonly step: 'APPROVING_TICKET' | 'COMPLETED';
  readonly order: PlaceOrderSagaOrder;
  readonly paymentToken?: never;
}

export interface CompensationSagaState {
  readonly step: 'REJECTING_TICKET' | 'COMPENSATED';
  readonly order: PlaceOrderSagaOrder;
  readonly rejectionReason: OrderRejectionReason;
  readonly paymentToken?: never;
}

export type PlaceOrderSagaState =
  BeforePivotSagaState | AfterPivotSagaState | CompensationSagaState;

export type PlaceOrderSagaStep = PlaceOrderSagaState['step'];

export interface PlaceOrderSagaInstance {
  readonly sagaId: string;
  readonly state: PlaceOrderSagaState;
  readonly version: number;
  readonly deadlineAt: Date | undefined;
}
