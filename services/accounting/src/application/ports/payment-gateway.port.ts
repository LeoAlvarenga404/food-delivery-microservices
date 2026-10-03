import type { Either } from '@fd/domain';
import type { Currency } from '#domain/payment/payment.aggregate.ts';

export interface PaymentAuthorizationRequest {
  readonly idempotencyKey: string;
  readonly amountInCents: bigint;
  readonly currency: Currency;
  readonly paymentToken: string;
}

export interface GatewayAuthorization {
  readonly authorizationId: string;
}

export interface PaymentDeclined {
  readonly type: 'PaymentDeclined';
  readonly idempotencyKey: string;
}

export interface PaymentGateway {
  authorize(
    request: PaymentAuthorizationRequest,
  ): Promise<Either<PaymentDeclined, GatewayAuthorization>>;
}
