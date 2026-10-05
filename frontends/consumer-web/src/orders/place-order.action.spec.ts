import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { OrderPlacement } from '../consumer-api/consumer-api.adapter.ts';
import { sealCookieValue } from '../session/encrypted-cookie.adapter.ts';
import { sessionCookieName, type Session } from '../session/session-cookie.adapter.ts';
import { placeOrder } from './place-order.action.ts';

const browserCookies = vi.hoisted(() => new Map<string, string>());

vi.mock('next/headers', () => ({
  cookies: () =>
    Promise.resolve({
      get: (name: string) => {
        const sealed = browserCookies.get(name);
        return sealed === undefined ? undefined : { name, value: sealed };
      },
    }),
}));

const secret = 'a-session-secret-of-at-least-32-characters';
const environment: readonly (readonly [string, string])[] = [
  ['CONSUMER_API_URL', 'http://edge.test'],
  ['CONSUMER_WEB_PUBLIC_URL', 'http://site.test'],
  ['KEYCLOAK_ISSUER_URL', 'http://keycloak.test/realms/food-delivery'],
  ['KEYCLOAK_TOKEN_URL', 'http://keycloak.test/realms/food-delivery/protocol/openid-connect/token'],
  ['CONSUMER_WEB_CLIENT_SECRET', 'a-client-secret'],
  ['CONSUMER_WEB_SESSION_SECRET', secret],
];
const placement: OrderPlacement = {
  restaurantId: '0199a5d0-0000-7000-8000-00000000c001',
  lineItems: [{ menuItemId: '0199a5d0-0000-7000-8000-000000000101', quantity: 1 }],
  deliveryAddress: {
    street: 'Rua Augusta',
    number: '1500',
    city: 'Sao Paulo',
    postalCode: '01304-001',
  },
  paymentToken: 'tok_visa_0001',
  idempotencyKey: '0199a5d0-0000-7000-8000-0000000000f1',
};
const sentRequests: Request[] = [];

function storeSessionWithAccessTokenLasting(lifetimeInMilliseconds: number): void {
  const nowInMilliseconds = Date.now();
  const session: Session = {
    accessToken: 'access-token-of-ana',
    idToken: 'id-token-of-ana',
    accessTokenExpiresAtInMilliseconds: nowInMilliseconds + lifetimeInMilliseconds,
    expiresAtInMilliseconds: nowInMilliseconds + 1_500_000,
  };
  browserCookies.set(sessionCookieName, sealCookieValue(secret, sessionCookieName, session));
}

beforeEach(() => {
  browserCookies.clear();
  sentRequests.length = 0;
  environment.forEach(([name, variable]) => {
    vi.stubEnv(name, variable);
  });
  vi.stubGlobal('fetch', (request: Request) => {
    sentRequests.push(request);
    return Promise.resolve(
      Response.json({ orderId: '0199a5d0-0000-7000-8000-0000000000a7' }, { status: 201 }),
    );
  });
});

describe('placeOrder', () => {
  it('sends the order with the access token while it is valid', async () => {
    storeSessionWithAccessTokenLasting(200_000);

    await expect(placeOrder(placement)).resolves.toEqual({
      orderId: '0199a5d0-0000-7000-8000-0000000000a7',
    });
    expect(sentRequests[0]?.headers.get('authorization')).toBe('Bearer access-token-of-ana');
  });

  it('asks for a new sign-in instead of sending an expired access token', async () => {
    storeSessionWithAccessTokenLasting(-1000);

    await expect(placeOrder(placement)).resolves.toEqual({ isSignInRequired: true });
    expect(sentRequests).toEqual([]);
  });
});
