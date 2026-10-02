import type { MessageMetadata } from '#application/ports/unit-of-work.port.ts';
import type { RestaurantId } from '#domain/menu/restaurant-id.value-object.ts';
import type { ConsumerId } from '#domain/order/consumer-id.value-object.ts';
import type { DeliveryAddress } from '#domain/order/delivery-address.value-object.ts';
import type { RequestedLineItem } from '#domain/order/order.aggregate.ts';
import type { OrderPlacementError } from '#domain/order/order.errors.ts';

export interface PlaceOrderCommand {
  readonly idempotencyKey: string;
  readonly requestHash: string;
  readonly consumerId: ConsumerId;
  readonly restaurantId: RestaurantId;
  readonly requestedLineItems: readonly RequestedLineItem[];
  readonly deliveryAddress: DeliveryAddress;
  readonly paymentToken: string;
  readonly metadata: MessageMetadata;
}

export interface PlacedOrder {
  readonly orderId: string;
}

export interface UnknownRestaurant {
  readonly type: 'UnknownRestaurant';
  readonly restaurantId: RestaurantId;
}

export interface IdempotencyKeyReused {
  readonly type: 'IdempotencyKeyReused';
  readonly idempotencyKey: string;
}

export type PlaceOrderError = OrderPlacementError | UnknownRestaurant | IdempotencyKeyReused;
