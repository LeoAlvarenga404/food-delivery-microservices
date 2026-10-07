import type { ConsumerId } from './consumer-id.value-object.ts';
import type { GatewayAuthorizationId } from './gateway-authorization-id.value-object.ts';
import type { Money } from './money.value-object.ts';
import type { OrderId } from './order-id.value-object.ts';
import type { PaymentId } from './payment-id.value-object.ts';
import type { RestaurantId } from './restaurant-id.value-object.ts';

export type PaymentStatus = 'AUTHORIZED';

export interface AuthorizePaymentInput {
  readonly paymentId: PaymentId;
  readonly orderId: OrderId;
  readonly consumerId: ConsumerId;
  readonly restaurantId: RestaurantId;
  readonly amount: Money;
  readonly deliveryFee: Money;
  readonly gatewayAuthorizationId: GatewayAuthorizationId;
  readonly authorizedAt: Date;
}

export interface PaymentSnapshot extends AuthorizePaymentInput {
  readonly status: PaymentStatus;
  readonly version: number;
}

export class Payment {
  readonly #snapshot: PaymentSnapshot;

  private constructor(snapshot: PaymentSnapshot) {
    this.#snapshot = snapshot;
  }

  static authorize(input: AuthorizePaymentInput): Payment {
    return new Payment({ ...input, status: 'AUTHORIZED', version: 0 });
  }

  static restore(snapshot: PaymentSnapshot): Payment {
    return new Payment(snapshot);
  }

  toSnapshot(): PaymentSnapshot {
    return this.#snapshot;
  }
}
