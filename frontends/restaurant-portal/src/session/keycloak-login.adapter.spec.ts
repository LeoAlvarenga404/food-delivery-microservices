import { generateKeyPairSync, sign, type KeyObject } from 'node:crypto';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { z } from 'zod';
import {
  buildSignOutUrl,
  completeSignIn,
  startSignIn,
  type SignInSettings,
} from './keycloak-login.adapter.ts';

const issuer = 'http://keycloak.test/realms/food-delivery';
const portalUrl = 'http://portal.test/';
const pendingSignInKey = 'restaurant-portal-sign-in';
const pendingSignIn = {
  state: 'state-of-the-sign-in',
  codeVerifier: 'verifier-of-the-sign-in',
  returnPath: '/restaurants/0199a5d0-0000-7000-8000-0000000000b1',
};
const pendingSignInSchema = z.object({
  state: z.string(),
  codeVerifier: z.string(),
  returnPath: z.string(),
});
const base64UrlOf43Characters = /^[\w-]{43}$/;
const keySetUrl = `${issuer}/protocol/openid-connect/certs`;
const keycloakKeys = generateKeyPairSync('rsa', { modulusLength: 2048 });
const otherKeys = generateKeyPairSync('rsa', { modulusLength: 2048 });

class MemoryStorage {
  readonly items = new Map<string, string>();

  getItem(key: string): string | null {
    return this.items.get(key) ?? null;
  }

  setItem(key: string, item: string): void {
    this.items.set(key, item);
  }

  removeItem(key: string): void {
    this.items.delete(key);
  }
}

function toBase64Url(json: object): string {
  return Buffer.from(JSON.stringify(json)).toString('base64url');
}

function signIdToken(privateKey: KeyObject): string {
  const nowInSeconds = Math.floor(Date.now() / 1000);
  const signingInput = `${toBase64Url({ alg: 'RS256', kid: 'keycloak' })}.${toBase64Url({
    iss: issuer,
    aud: 'restaurant-portal',
    sub: '0199a5d0-0000-7000-8000-0000000000e1',
    iat: nowInSeconds,
    exp: nowInSeconds + 300,
  })}`;
  const signature = sign('sha256', Buffer.from(signingInput), privateKey).toString('base64url');
  return `${signingInput}.${signature}`;
}

function answerAsKeycloak(tokenRequests: Request[], privateKey = keycloakKeys.privateKey): void {
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
      ['access_token', 'access-token-of-staff-a'],
      ['token_type', 'Bearer'],
      ['expires_in', 300],
      ['id_token', signIdToken(privateKey)],
    ]),
  );
  vi.stubGlobal('fetch', (input: Request | URL | string, init?: RequestInit) => {
    const request = new Request(input, init);
    if (request.url === keySetUrl) return Promise.resolve(Response.json(keySet));
    tokenRequests.push(request);
    return Promise.resolve(Response.json(tokens));
  });
}

function keycloakCallback(parameters: Readonly<Record<string, string>>): URL {
  return new URL(`${portalUrl}?${new URLSearchParams(parameters).toString()}`);
}

function sortedParameters(parameters: URLSearchParams): readonly (readonly string[])[] {
  return [...parameters].sort(([first], [second]) => first.localeCompare(second));
}

async function challengeOf(codeVerifier: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(codeVerifier));
  return Buffer.from(digest).toString('base64url');
}

let storage: MemoryStorage;
let settings: SignInSettings;

beforeEach(() => {
  vi.unstubAllGlobals();
  storage = new MemoryStorage();
  settings = { keycloakIssuerUrl: issuer, redirectUrl: portalUrl, storage };
});

describe('startSignIn', () => {
  it('sends the staff member to Keycloak with PKCE and keeps the state and the return path', async () => {
    const authorizationUrl = await startSignIn(settings, pendingSignIn.returnPath);

    const pending = pendingSignInSchema.parse(JSON.parse(storage.getItem(pendingSignInKey) ?? ''));
    expect(pending.returnPath).toBe(pendingSignIn.returnPath);
    expect(pending.state).toMatch(base64UrlOf43Characters);
    expect(`${authorizationUrl.origin}${authorizationUrl.pathname}`).toBe(
      `${issuer}/protocol/openid-connect/auth`,
    );
    expect(sortedParameters(authorizationUrl.searchParams)).toEqual([
      ['client_id', 'restaurant-portal'],
      ['code_challenge', await challengeOf(pending.codeVerifier)],
      ['code_challenge_method', 'S256'],
      ['redirect_uri', portalUrl],
      ['response_type', 'code'],
      ['scope', 'openid'],
      ['state', pending.state],
    ]);
  });
});

describe('completeSignIn', () => {
  beforeEach(() => {
    storage.setItem(pendingSignInKey, JSON.stringify(pendingSignIn));
  });

  it('trades the code for the tokens as a public client, sending the PKCE verifier', async () => {
    const tokenRequests: Request[] = [];
    answerAsKeycloak(tokenRequests);

    const signedIn = await completeSignIn(
      settings,
      keycloakCallback({ code: 'code-of-the-sign-in', state: pendingSignIn.state, iss: issuer }),
    );

    expect(signedIn?.accessToken).toBe('access-token-of-staff-a');
    expect(signedIn?.returnPath).toBe(pendingSignIn.returnPath);
    const [tokenRequest] = tokenRequests;
    expect(tokenRequest?.url).toBe(`${issuer}/protocol/openid-connect/token`);
    expect(sortedParameters(new URLSearchParams(await tokenRequest?.text()))).toEqual([
      ['client_id', 'restaurant-portal'],
      ['code', 'code-of-the-sign-in'],
      ['code_verifier', pendingSignIn.codeVerifier],
      ['grant_type', 'authorization_code'],
      ['redirect_uri', portalUrl],
    ]);
    expect(storage.items.size).toBe(0);
  });

  it('refuses an ID token that Keycloak did not sign', async () => {
    answerAsKeycloak([], otherKeys.privateKey);

    await expect(
      completeSignIn(
        settings,
        keycloakCallback({ code: 'code-of-the-sign-in', state: pendingSignIn.state, iss: issuer }),
      ),
    ).rejects.toMatchObject({ cause: { message: 'JWT signature verification failed' } });
    expect(storage.items.size).toBe(0);
  });

  it('refuses a callback carrying another state', async () => {
    answerAsKeycloak([]);

    await expect(
      completeSignIn(
        settings,
        keycloakCallback({ code: 'code-of-the-sign-in', state: 'forged-state', iss: issuer }),
      ),
    ).rejects.toMatchObject({ cause: { message: 'unexpected "state" response parameter value' } });
    expect(storage.items.size).toBe(0);
  });

  it('refuses a callback without the issuer parameter Keycloak always sends', async () => {
    answerAsKeycloak([]);

    await expect(
      completeSignIn(
        settings,
        keycloakCallback({ code: 'code-of-the-sign-in', state: pendingSignIn.state }),
      ),
    ).rejects.toMatchObject({ cause: { message: 'response parameter "iss" (issuer) missing' } });
    expect(storage.items.size).toBe(0);
  });

  it('starts over when the page carries no code, and forgets the pending sign-in', async () => {
    await expect(completeSignIn(settings, new URL(portalUrl))).resolves.toBeUndefined();
    expect(storage.items.size).toBe(0);
  });

  it('starts over when a code arrives without a sign-in pending in this tab', async () => {
    storage.removeItem(pendingSignInKey);

    await expect(
      completeSignIn(
        settings,
        keycloakCallback({ code: 'code-of-the-sign-in', state: pendingSignIn.state, iss: issuer }),
      ),
    ).resolves.toBeUndefined();
  });
});

describe('buildSignOutUrl', () => {
  it('ends the Keycloak session with the ID token as a hint and comes back to the portal', () => {
    const signOutUrl = buildSignOutUrl(settings, 'id-token-of-staff-a');

    expect(`${signOutUrl.origin}${signOutUrl.pathname}`).toBe(
      `${issuer}/protocol/openid-connect/logout`,
    );
    expect(sortedParameters(signOutUrl.searchParams)).toEqual([
      ['client_id', 'restaurant-portal'],
      ['id_token_hint', 'id-token-of-staff-a'],
      ['post_logout_redirect_uri', portalUrl],
    ]);
  });
});
