import type { Either } from '@fd/domain';
import type { Money } from '#domain/payment/money.value-object.ts';

export interface PaymentAuthorizationRequest {
  readonly idempotencyKey: string;
  readonly amount: Money;
  readonly paymentToken: string;
}

export interface GatewayAuthorization {
  readonly authorizationId: string;
}

export interface AuthorizationVoidRequest {
  readonly idempotencyKey: string;
  readonly authorizationId: string;
}

export interface GatewayVoid {
  readonly voidId: string;
}

export interface PaymentDeclined {
  readonly type: 'PaymentDeclined';
  readonly idempotencyKey: string;
}

export interface PaymentGateway {
  authorize(
    request: PaymentAuthorizationRequest,
  ): Promise<Either<PaymentDeclined, GatewayAuthorization>>;
  void(request: AuthorizationVoidRequest): Promise<GatewayVoid>;
}
