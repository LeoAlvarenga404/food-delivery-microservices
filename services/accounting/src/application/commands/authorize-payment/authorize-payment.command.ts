import type { MessageMetadata } from '#application/ports/unit-of-work.port.ts';
import type { ConsumerId } from '#domain/payment/consumer-id.value-object.ts';
import type { Money } from '#domain/payment/money.value-object.ts';
import type { OrderId } from '#domain/payment/order-id.value-object.ts';
import type { RestaurantId } from '#domain/payment/restaurant-id.value-object.ts';

export interface AuthorizePaymentCommand {
  readonly orderId: OrderId;
  readonly consumerId: ConsumerId;
  readonly restaurantId: RestaurantId;
  readonly amount: Money;
  readonly deliveryFee: Money;
  readonly paymentToken: string;
  readonly sagaId: string;
  readonly metadata: MessageMetadata;
}
