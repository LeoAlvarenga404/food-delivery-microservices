import { setTimeout as delay } from 'node:timers/promises';
import { left, right, type Either } from '@fd/domain';
import type {
  GatewayAuthorization,
  PaymentAuthorizationRequest,
  PaymentDeclined,
  PaymentGateway,
} from '#application/ports/payment-gateway.port.ts';

export class PaymentGatewayTimeoutError extends Error {
  override readonly name = 'PaymentGatewayTimeoutError';
  readonly code = 'ETIMEDOUT';
}

export interface SimulatedPaymentGatewaySettings {
  readonly slowResponseInMilliseconds: number;
  readonly generateAuthorizationId: () => string;
}

const decliningCardSuffix = '0002';
const timingOutCardSuffix = '0005';
const slowCardSuffix = '0009';

export class SimulatedPaymentGateway implements PaymentGateway {
  readonly #settings: SimulatedPaymentGatewaySettings;
  readonly #authorizations = new Map<string, GatewayAuthorization>();

  constructor(settings: SimulatedPaymentGatewaySettings) {
    this.#settings = settings;
  }

  async authorize(
    request: PaymentAuthorizationRequest,
  ): Promise<Either<PaymentDeclined, GatewayAuthorization>> {
    const previous = this.#authorizations.get(request.idempotencyKey);
    if (previous !== undefined) return right(previous);
    const { paymentToken, idempotencyKey } = request;
    if (paymentToken.endsWith(decliningCardSuffix)) {
      return left({ type: 'PaymentDeclined', idempotencyKey });
    }
    if (paymentToken.endsWith(timingOutCardSuffix)) {
      throw new PaymentGatewayTimeoutError(`gateway timed out for ${idempotencyKey}`);
    }
    if (paymentToken.endsWith(slowCardSuffix)) {
      await delay(this.#settings.slowResponseInMilliseconds);
    }
    const authorization = { authorizationId: this.#settings.generateAuthorizationId() };
    this.#authorizations.set(idempotencyKey, authorization);
    return right(authorization);
  }
}
