import type { AccessTokenVerifier, TokenExchange } from '@fd/chassis-auth';
import { left, right } from '@fd/domain';
import { beforeEach, describe, expect, it } from 'vitest';
import {
  createOrderServiceAccess,
  type OrderServiceAccess,
} from './order-service-access.adapter.ts';

const verifiedAccessTokens = new Map([
  ['consumer-token', { subject: '0199a5d0-0000-7000-8000-0000000000c1', roles: ['consumer'] }],
  ['staff-token', { subject: '0199a5d0-0000-7000-8000-0000000000e1', roles: ['restaurant_staff'] }],
  [
    'refused-exchange-token',
    { subject: '0199a5d0-0000-7000-8000-0000000000c2', roles: ['consumer'] },
  ],
]);

let exchanges: { readonly subjectToken: string; readonly audience: string }[];
let orderServiceAccess: OrderServiceAccess;

const verify: AccessTokenVerifier = (accessToken) => {
  const verified = verifiedAccessTokens.get(accessToken);
  return Promise.resolve(
    verified === undefined
      ? left({ type: 'InvalidAccessToken', reason: 'ERR_JWT_EXPIRED' })
      : right(verified),
  );
};

const exchange: TokenExchange = (subjectToken, audience) => {
  exchanges.push({ subjectToken, audience });
  return Promise.resolve(
    subjectToken === 'refused-exchange-token'
      ? left({ type: 'TokenExchangeRefused', error: 'invalid_request' })
      : right(`${audience}-token-for-${subjectToken}`),
  );
};

beforeEach(() => {
  exchanges = [];
  orderServiceAccess = createOrderServiceAccess({ verify, exchange });
});

describe('createOrderServiceAccess', () => {
  it('exchanges the token of a consumer for an order service token', async () => {
    const access = await orderServiceAccess('Bearer consumer-token');

    expect(access).toEqual(right('order-service-token-for-consumer-token'));
    expect(exchanges).toEqual([{ subjectToken: 'consumer-token', audience: 'order-service' }]);
  });

  it.each([
    { scenario: 'no authorization', authorization: undefined },
    { scenario: 'another authorization scheme', authorization: 'Basic Y29uc3VtZXI6c2VjcmV0' },
    { scenario: 'a token the verifier refuses', authorization: 'Bearer expired-token' },
  ])('refuses $scenario as unauthenticated without exchanging', async ({ authorization }) => {
    expect(await orderServiceAccess(authorization)).toEqual(left({ status: 401 }));
    expect(exchanges).toEqual([]);
  });

  it('refuses a caller without the consumer role as forbidden without exchanging', async () => {
    expect(await orderServiceAccess('Bearer staff-token')).toEqual(left({ status: 403 }));
    expect(exchanges).toEqual([]);
  });

  it('refuses a token the issuer will not exchange as unauthenticated', async () => {
    expect(await orderServiceAccess('Bearer refused-exchange-token')).toEqual(
      left({ status: 401 }),
    );
  });

  it.each([
    {
      failingStep: 'the key set',
      failing: { verify: () => Promise.reject(new Error('key set unreachable')), exchange },
    },
    {
      failingStep: 'the token endpoint',
      failing: { verify, exchange: () => Promise.reject(new Error('token endpoint unreachable')) },
    },
  ])('fails instead of refusing when $failingStep cannot be reached', async ({ failing }) => {
    await expect(createOrderServiceAccess(failing)('Bearer consumer-token')).rejects.toThrow(
      'unreachable',
    );
  });
});
