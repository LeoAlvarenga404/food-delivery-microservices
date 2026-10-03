import { ExternalDependencyFailure } from '@fd/chassis-kafka';
import { left, right } from '@fd/domain';
import { describe, expect, it } from 'vitest';
import type { PaymentAuthorizationRequest } from '#application/ports/payment-gateway.port.ts';
import {
  PaymentGatewayTimeoutError,
  SimulatedPaymentGateway,
} from './simulated-payment-gateway.adapter.ts';

const slowResponseInMilliseconds = 50;

function simulatedGateway(): SimulatedPaymentGateway {
  let authorizationCount = 0;
  return new SimulatedPaymentGateway({
    slowResponseInMilliseconds,
    generateAuthorizationId: () => {
      authorizationCount += 1;
      return `authorization-${String(authorizationCount)}`;
    },
  });
}

function request(
  overrides: Partial<PaymentAuthorizationRequest> = {},
): PaymentAuthorizationRequest {
  return {
    idempotencyKey: '0199a5d0-0000-7000-8000-0000000000b1:AuthorizePayment',
    amountInCents: 9800n,
    currency: 'BRL',
    paymentToken: 'tok_visa_4242',
    ...overrides,
  };
}

describe('SimulatedPaymentGateway', () => {
  it('authorizes an ordinary card', async () => {
    expect(await simulatedGateway().authorize(request())).toEqual(
      right({ authorizationId: 'authorization-1' }),
    );
  });

  it('answers a repeated idempotency key with the first authorization', async () => {
    const gateway = simulatedGateway();

    await gateway.authorize(request());

    expect(await gateway.authorize(request())).toEqual(
      right({ authorizationId: 'authorization-1' }),
    );
  });

  it('answers a repeated idempotency key with the first authorization whatever the request says', async () => {
    const gateway = simulatedGateway();

    await gateway.authorize(request());
    const repeated = await gateway.authorize(
      request({ paymentToken: 'tok_visa_0002', amountInCents: 1n }),
    );

    expect(repeated).toEqual(right({ authorizationId: 'authorization-1' }));
  });

  it('declines a card ending in 0002', async () => {
    const declined = request({ paymentToken: 'tok_visa_0002' });

    expect(await simulatedGateway().authorize(declined)).toEqual(
      left({ type: 'PaymentDeclined', idempotencyKey: declined.idempotencyKey }),
    );
  });

  it('times out for a card ending in 0005 as a failing external dependency', async () => {
    const authorization = simulatedGateway().authorize(request({ paymentToken: 'tok_visa_0005' }));

    await expect(authorization).rejects.toThrow(PaymentGatewayTimeoutError);
    await expect(authorization).rejects.toThrow(ExternalDependencyFailure);
    await expect(authorization).rejects.toMatchObject({
      name: 'PaymentGatewayTimeoutError',
      code: 'ETIMEDOUT',
    });
  });

  it('answers slowly for a card ending in 0009', async () => {
    const startedAt = performance.now();

    await simulatedGateway().authorize(request({ paymentToken: 'tok_visa_0009' }));

    const elapsedInMilliseconds = performance.now() - startedAt;
    expect(elapsedInMilliseconds).toBeGreaterThanOrEqual(slowResponseInMilliseconds - 5);
    expect(elapsedInMilliseconds).toBeLessThan(slowResponseInMilliseconds + 1000);
  });
});
