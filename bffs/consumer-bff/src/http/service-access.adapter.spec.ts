import type { AccessTokenVerifier, TokenExchange } from '@fd/chassis-auth';
import { left, right } from '@fd/domain';
import { beforeEach, describe, expect, it } from 'vitest';
import { createServiceAccess, type ServiceAccess } from './service-access.adapter.ts';

const verifiedAccessTokens = new Map([
  ['consumer-token', { subject: '0199a5d0-0000-7000-8000-0000000000c1', roles: ['consumer'] }],
  ['staff-token', { subject: '0199a5d0-0000-7000-8000-0000000000e1', roles: ['restaurant_staff'] }],
  [
    'refused-exchange-token',
    { subject: '0199a5d0-0000-7000-8000-0000000000c2', roles: ['consumer'] },
  ],
]);

let exchanges: { readonly subjectToken: string; readonly audience: string }[];
let serviceAccess: ServiceAccess;

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
  serviceAccess = createServiceAccess({ verify, exchange });
});

describe('createServiceAccess', () => {
  it.each(['order-service', 'consumer-service'])(
    'exchanges the token of a consumer for a token of the %s audience',
    async (audience) => {
      const access = await serviceAccess('Bearer consumer-token', audience);

      expect(access).toEqual(right(`${audience}-token-for-consumer-token`));
      expect(exchanges).toEqual([{ subjectToken: 'consumer-token', audience }]);
    },
  );

  it.each([
    { scenario: 'no authorization', authorization: undefined },
    { scenario: 'another authorization scheme', authorization: 'Basic Y29uc3VtZXI6c2VjcmV0' },
    { scenario: 'a token the verifier refuses', authorization: 'Bearer expired-token' },
  ])('refuses $scenario as unauthenticated without exchanging', async ({ authorization }) => {
    expect(await serviceAccess(authorization, 'order-service')).toEqual(left({ status: 401 }));
    expect(exchanges).toEqual([]);
  });

  it('refuses a caller without the consumer role as forbidden without exchanging', async () => {
    expect(await serviceAccess('Bearer staff-token', 'order-service')).toEqual(
      left({ status: 403 }),
    );
    expect(exchanges).toEqual([]);
  });

  it('refuses a token the issuer will not exchange as unauthenticated', async () => {
    expect(await serviceAccess('Bearer refused-exchange-token', 'order-service')).toEqual(
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
    await expect(
      createServiceAccess(failing)('Bearer consumer-token', 'order-service'),
    ).rejects.toThrow('unreachable');
  });
});
