import { left, right, type Either } from '@fd/domain';
import type {
  AuthorizationVoidRequest,
  GatewayAuthorization,
  GatewayVoid,
  PaymentAuthorizationRequest,
  PaymentDeclined,
  PaymentGateway,
} from '#application/ports/payment-gateway.port.ts';

export class FakePaymentGateway implements PaymentGateway {
  readonly requests: PaymentAuthorizationRequest[] = [];
  readonly voidRequests: AuthorizationVoidRequest[] = [];
  readonly #isDeclining: boolean;

  constructor(isDeclining = false) {
    this.#isDeclining = isDeclining;
  }

  authorize(
    request: PaymentAuthorizationRequest,
  ): Promise<Either<PaymentDeclined, GatewayAuthorization>> {
    this.requests.push(request);
    if (this.#isDeclining) {
      return Promise.resolve(
        left({ type: 'PaymentDeclined', idempotencyKey: request.idempotencyKey }),
      );
    }
    return Promise.resolve(right({ authorizationId: '0199a5d0-0000-7000-8000-000000000a99' }));
  }

  void(request: AuthorizationVoidRequest): Promise<GatewayVoid> {
    this.voidRequests.push(request);
    return Promise.resolve({ voidId: '0199a5d0-0000-7000-8000-000000000a97' });
  }
}
