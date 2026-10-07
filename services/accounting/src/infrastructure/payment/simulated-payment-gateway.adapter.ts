import { setTimeout as delay } from 'node:timers/promises';
import { ExternalDependencyFailure } from '@fd/chassis-kafka';
import { left, right, type Either } from '@fd/domain';
import type {
  AuthorizationVoidRequest,
  GatewayAuthorization,
  GatewayVoid,
  PaymentAuthorizationRequest,
  PaymentDeclined,
  PaymentGateway,
} from '#application/ports/payment-gateway.port.ts';

export class PaymentGatewayTimeoutError extends ExternalDependencyFailure {
  override readonly name = 'PaymentGatewayTimeoutError';
  readonly code = 'ETIMEDOUT';
}

export interface SimulatedPaymentGatewaySettings {
  readonly slowResponseInMilliseconds: number;
  readonly generateAuthorizationId: () => string;
  readonly generateVoidId: () => string;
}

const decliningCardSuffix = '0002';
const timingOutCardSuffix = '0005';
const slowCardSuffix = '0009';

export class SimulatedPaymentGateway implements PaymentGateway {
  readonly #settings: SimulatedPaymentGatewaySettings;
  readonly #authorizations = new Map<string, GatewayAuthorization>();
  readonly #voids = new Map<string, GatewayVoid>();

  constructor(settings: SimulatedPaymentGatewaySettings) {
    this.#settings = settings;
  }

  async authorize(
    request: PaymentAuthorizationRequest,
  ): Promise<Either<PaymentDeclined, GatewayAuthorization>> {
    const firstAuthorization = this.#authorizations.get(request.idempotencyKey);
    if (firstAuthorization !== undefined) return right(firstAuthorization);
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

  void(request: AuthorizationVoidRequest): Promise<GatewayVoid> {
    const firstVoid = this.#voids.get(request.idempotencyKey);
    if (firstVoid !== undefined) return Promise.resolve(firstVoid);
    const gatewayVoid = { voidId: this.#settings.generateVoidId() };
    this.#voids.set(request.idempotencyKey, gatewayVoid);
    return Promise.resolve(gatewayVoid);
  }
}
