import type { AccessTokenVerifier, TokenExchange } from '@fd/chassis-auth';
import { left, right } from '@fd/domain';
import { beforeEach, describe, expect, it } from 'vitest';
import { createServiceAccess, type ServiceAccess } from './service-access.adapter.ts';

const verifiedAccessTokens = new Map([
  ['staff-token', { subject: '0199a5d0-0000-7000-8000-0000000000e1', roles: ['restaurant_staff'] }],
  ['consumer-token', { subject: '0199a5d0-0000-7000-8000-0000000000c1', roles: ['consumer'] }],
  [
    'look-alike-token',
    { subject: '0199a5d0-0000-7000-8000-0000000000e3', roles: ['Restaurant_Staff', 'staff'] },
  ],
  [
    'refused-exchange-token',
    { subject: '0199a5d0-0000-7000-8000-0000000000e2', roles: ['restaurant_staff'] },
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
  it('exchanges the token of restaurant staff for a token of the restaurant-service audience', async () => {
    const access = await serviceAccess('Bearer staff-token', 'restaurant-service');

    expect(access).toEqual(right('restaurant-service-token-for-staff-token'));
    expect(exchanges).toEqual([{ subjectToken: 'staff-token', audience: 'restaurant-service' }]);
  });

  it.each([
    { scenario: 'no authorization', authorization: undefined },
    { scenario: 'another authorization scheme', authorization: 'Basic c3RhZmY6c2VjcmV0' },
    { scenario: 'a token the verifier refuses', authorization: 'Bearer expired-token' },
  ])('refuses $scenario as unauthenticated without exchanging', async ({ authorization }) => {
    expect(await serviceAccess(authorization, 'restaurant-service')).toEqual(left({ status: 401 }));
    expect(exchanges).toEqual([]);
  });

  it.each(['Bearer consumer-token', 'Bearer look-alike-token'])(
    'refuses %s, which lacks the restaurant staff role, as forbidden without exchanging',
    async (authorization) => {
      expect(await serviceAccess(authorization, 'restaurant-service')).toEqual(
        left({ status: 403 }),
      );
      expect(exchanges).toEqual([]);
    },
  );

  it('refuses a token the issuer will not exchange as unauthenticated', async () => {
    expect(await serviceAccess('Bearer refused-exchange-token', 'restaurant-service')).toEqual(
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
      createServiceAccess(failing)('Bearer staff-token', 'restaurant-service'),
    ).rejects.toThrow('unreachable');
  });
});
