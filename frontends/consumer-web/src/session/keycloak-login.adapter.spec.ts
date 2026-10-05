import { generateKeyPairSync, sign, type KeyObject } from 'node:crypto';
import { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { sealCookieValue } from './encrypted-cookie.adapter.ts';
import { completeLogin, toSafeReturnPath } from './keycloak-login.adapter.ts';

const publicUrl = 'http://localhost:8080';
const issuer = 'http://keycloak.test/realms/food-delivery';
const tokenUrl = 'http://keycloak.internal/realms/food-delivery/protocol/openid-connect/token';
const keySetUrl = 'http://keycloak.internal/realms/food-delivery/protocol/openid-connect/certs';
const secret = 'a-session-secret-of-at-least-32-characters';
const login = {
  state: 'state-of-the-sign-in',
  codeVerifier: 'verifier-of-the-sign-in',
  returnPath: '/cart',
};
const environment: readonly (readonly [string, string])[] = [
  ['CONSUMER_API_URL', 'http://edge.test'],
  ['CONSUMER_WEB_PUBLIC_URL', publicUrl],
  ['KEYCLOAK_ISSUER_URL', issuer],
  ['KEYCLOAK_TOKEN_URL', tokenUrl],
  ['CONSUMER_WEB_CLIENT_SECRET', 'a-client-secret'],
  ['CONSUMER_WEB_SESSION_SECRET', secret],
];
const keycloakKeys = generateKeyPairSync('rsa', { modulusLength: 2048 });
const otherKeys = generateKeyPairSync('rsa', { modulusLength: 2048 });

function toBase64Url(json: object): string {
  return Buffer.from(JSON.stringify(json)).toString('base64url');
}

function signIdToken(privateKey: KeyObject): string {
  const nowInSeconds = Math.floor(Date.now() / 1000);
  const signingInput = `${toBase64Url({ alg: 'RS256', kid: 'keycloak' })}.${toBase64Url({
    iss: issuer,
    aud: 'consumer-web',
    sub: 'consumer-a',
    iat: nowInSeconds,
    exp: nowInSeconds + 300,
  })}`;
  const signature = sign('sha256', Buffer.from(signingInput), privateKey).toString('base64url');
  return `${signingInput}.${signature}`;
}

function answerAsKeycloak(idToken: string): void {
  const keySet = {
    keys: [
      {
        ...keycloakKeys.publicKey.export({ format: 'jwk' }),
        kid: 'keycloak',
        alg: 'RS256',
        use: 'sig',
      },
    ],
  };
  const tokens = Object.fromEntries(
    new Map<string, string | number>([
      ['access_token', 'access-token-of-ana'],
      ['token_type', 'Bearer'],
      ['expires_in', 300],
      ['refresh_expires_in', 1800],
      ['id_token', idToken],
    ]),
  );
  vi.stubGlobal('fetch', (input: Request | URL | string) => {
    const url = input instanceof Request ? input.url : String(input);
    return Promise.resolve(Response.json(url === keySetUrl ? keySet : tokens));
  });
}

function callback(searchParameters: Readonly<Record<string, string>>): NextRequest {
  const url = `${publicUrl}/auth/callback?${new URLSearchParams(searchParameters).toString()}`;
  const sealedLogin = sealCookieValue(secret, 'consumer-web-login', login);
  return new NextRequest(url, { headers: { cookie: `consumer-web-login=${sealedLogin}` } });
}

const keycloakCallback = callback({ code: 'code-of-the-sign-in', state: login.state, iss: issuer });

beforeEach(() => {
  vi.unstubAllGlobals();
  environment.forEach(([name, variable]) => {
    vi.stubEnv(name, variable);
  });
});

describe('toSafeReturnPath', () => {
  it.each([
    ['/cart', '/cart'],
    [
      '/orders/0199a5d0-0000-7000-8000-0000000000a7?from=checkout',
      '/orders/0199a5d0-0000-7000-8000-0000000000a7?from=checkout',
    ],
    ['profile', '/profile'],
  ])('keeps the path %s of this site', (returnTo, expected) => {
    expect(toSafeReturnPath(returnTo, publicUrl)).toBe(expected);
  });

  it.each([
    ['no return path', null],
    ['another origin', 'https://evil.example/cart'],
    ['a protocol-relative URL', '//evil.example/cart'],
    ['dot segments that leave two leading slashes', '/.//evil.example/cart'],
    ['a parent segment that leaves two leading slashes', '/orders/..//evil.example'],
    ['a tab the URL parser removes', '/\t/evil.example/cart'],
    ['another scheme', 'javascript:alert(1)'],
    ['an address the URL parser refuses', 'http://['],
  ])('goes home for %s', (description, returnTo) => {
    expect(toSafeReturnPath(returnTo, publicUrl)).toBe('/');
  });
});

describe('completeLogin', () => {
  it('opens the session when Keycloak signed the ID token', async () => {
    answerAsKeycloak(signIdToken(keycloakKeys.privateKey));

    const response = await completeLogin(keycloakCallback);

    expect(response.status).toBe(303);
    expect(response.headers.get('location')).toBe(`${publicUrl}/cart`);
    expect(response.cookies.has('consumer-web-session')).toBe(true);
  });

  it('refuses an ID token signed by another key', async () => {
    answerAsKeycloak(signIdToken(otherKeys.privateKey));

    await expect(completeLogin(keycloakCallback)).rejects.toMatchObject({
      cause: { message: 'JWT signature verification failed' },
    });
  });

  it('refuses a callback without the issuer parameter Keycloak always sends', async () => {
    answerAsKeycloak(signIdToken(keycloakKeys.privateKey));

    await expect(
      completeLogin(callback({ code: 'code-of-the-sign-in', state: login.state })),
    ).rejects.toMatchObject({ cause: { message: 'response parameter "iss" (issuer) missing' } });
  });
});
