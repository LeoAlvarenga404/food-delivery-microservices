import { left, right, type Either } from '@fd/domain';
import type { ConsumerId } from './consumer-id.value-object.ts';
import type { GatewayAuthorizationId } from './gateway-authorization-id.value-object.ts';
import type { GatewayVoidId } from './gateway-void-id.value-object.ts';
import type { Money } from './money.value-object.ts';
import type { OrderId } from './order-id.value-object.ts';
import type { PaymentId } from './payment-id.value-object.ts';
import type { RestaurantId } from './restaurant-id.value-object.ts';

export interface PaymentVoid {
  readonly voidedAt: Date;
  readonly gatewayVoidId: GatewayVoidId;
}

export type PaymentState =
  { readonly status: 'AUTHORIZED' } | ({ readonly status: 'VOIDED' } & PaymentVoid);

export type PaymentStatus = PaymentState['status'];

export interface PaymentAlreadyVoided {
  readonly type: 'PaymentAlreadyVoided';
  readonly paymentId: PaymentId;
}

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
  readonly state: PaymentState;
  readonly version: number;
}

export class Payment {
  #snapshot: PaymentSnapshot;

  private constructor(snapshot: PaymentSnapshot) {
    this.#snapshot = snapshot;
  }

  static authorize(input: AuthorizePaymentInput): Payment {
    return new Payment({ ...input, state: { status: 'AUTHORIZED' }, version: 0 });
  }

  static restore(snapshot: PaymentSnapshot): Payment {
    return new Payment(snapshot);
  }

  void(paymentVoid: PaymentVoid): Either<PaymentAlreadyVoided, void> {
    const { paymentId, state } = this.#snapshot;
    if (state.status === 'VOIDED') return left({ type: 'PaymentAlreadyVoided', paymentId });
    this.#snapshot = { ...this.#snapshot, state: { status: 'VOIDED', ...paymentVoid } };
    return right(undefined);
  }

  toSnapshot(): PaymentSnapshot {
    return this.#snapshot;
  }
}
