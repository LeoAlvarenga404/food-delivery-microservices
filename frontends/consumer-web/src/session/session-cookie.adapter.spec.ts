import { NextResponse } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { sealCookieValue } from './encrypted-cookie.adapter.ts';
import {
  openSession,
  readAccessToken,
  readSession,
  requireAccessToken,
  sessionCookieName,
  setSessionCookie,
  type Session,
} from './session-cookie.adapter.ts';

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

vi.mock('next/navigation', () => ({
  redirect: (url: string): never => {
    throw new Error(`redirected to ${url}`);
  },
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
const session: Session = {
  accessToken: 'access-token-of-ana',
  idToken: 'id-token-of-ana',
  accessTokenExpiresAtInMilliseconds: 1_800_000_300_000,
  expiresAtInMilliseconds: 1_800_001_800_000,
};

function sessionLasting(
  accessTokenLifetimeInMilliseconds: number,
  lifetimeInMilliseconds: number,
): Session {
  const nowInMilliseconds = Date.now();
  return {
    ...session,
    accessTokenExpiresAtInMilliseconds: nowInMilliseconds + accessTokenLifetimeInMilliseconds,
    expiresAtInMilliseconds: nowInMilliseconds + lifetimeInMilliseconds,
  };
}

function storeSessionCookie(storedSession: Session): void {
  browserCookies.set(sessionCookieName, sealCookieValue(secret, sessionCookieName, storedSession));
}

beforeEach(() => {
  browserCookies.clear();
  environment.forEach(([name, variable]) => {
    vi.stubEnv(name, variable);
  });
});

describe('openSession', () => {
  it('keeps the session after its access token expires, so the consumer can still sign out', () => {
    const sealed = sealCookieValue(secret, sessionCookieName, session);

    expect(openSession(secret, sealed, 1_800_000_300_000)).toEqual(session);
  });

  it('treats a session as gone from the moment the Keycloak session idles out', () => {
    const sealed = sealCookieValue(secret, sessionCookieName, session);

    expect(openSession(secret, sealed, 1_800_001_800_000)).toBeUndefined();
  });

  it('answers no session without a cookie', () => {
    expect(openSession(secret, undefined, 1_800_000_000_000)).toBeUndefined();
  });

  it('refuses a sealed value that is not a whole session', () => {
    const sealed = sealCookieValue(secret, sessionCookieName, { ...session, idToken: '' });

    expect(openSession(secret, sealed, 1_800_000_000_000)).toBeUndefined();
  });

  it('refuses a session sealed under another secret', () => {
    const sealed = sealCookieValue(
      'another-session-secret-of-32-characters',
      sessionCookieName,
      session,
    );

    expect(openSession(secret, sealed, 1_800_000_000_000)).toBeUndefined();
  });
});

describe('setSessionCookie', () => {
  it('keeps the cookie as long as the Keycloak session, not as long as the access token', () => {
    const response = NextResponse.next();

    setSessionCookie(response, secret, sessionLasting(300_500, 1_800_500));

    expect(response.cookies.get(sessionCookieName)?.maxAge).toBe(1800);
  });
});

describe('readSession', () => {
  it('reads the session of a consumer whose access token expired, so the layout offers Sign out', async () => {
    const withExpiredAccessToken = sessionLasting(-1000, 1_500_000);
    storeSessionCookie(withExpiredAccessToken);

    await expect(readSession()).resolves.toEqual(withExpiredAccessToken);
  });
});

describe('readAccessToken and requireAccessToken', () => {
  it('answer the access token while it is valid', async () => {
    storeSessionCookie(sessionLasting(200_000, 1_500_000));

    await expect(readAccessToken()).resolves.toBe('access-token-of-ana');
    await expect(requireAccessToken('/profile')).resolves.toBe('access-token-of-ana');
  });

  it('answer no expired access token, so no page sends it to the API', async () => {
    storeSessionCookie(sessionLasting(-1000, 1_500_000));

    await expect(readAccessToken()).resolves.toBeUndefined();
  });

  it('send the consumer through the sign-in instead of using an expired access token', async () => {
    storeSessionCookie(sessionLasting(-1000, 1_500_000));

    await expect(requireAccessToken('/profile')).rejects.toThrow(
      'redirected to /auth/login?returnTo=%2Fprofile',
    );
  });
});
