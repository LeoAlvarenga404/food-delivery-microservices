import { NextResponse, type NextRequest } from 'next/server';
import * as openIdClient from 'openid-client';
import { z } from 'zod';
import {
  readConsumerWebConfiguration,
  type ConsumerWebConfiguration,
} from '../consumer-web.config.ts';
import { openCookieValue, sealCookieValue } from './encrypted-cookie.adapter.ts';
import {
  openSession,
  sessionCookieName,
  setSessionCookie,
  type Session,
} from './session-cookie.adapter.ts';

const clientId = 'consumer-web';
const loginCookieName = 'consumer-web-login';
const loginCookiePath = '/auth/callback';
const loginLifetimeInSeconds = 600;
const millisecondsPerSecond = 1000;
const authorizationEndpointField = 'authorization_endpoint';
const tokenEndpointField = 'token_endpoint';
const endSessionEndpointField = 'end_session_endpoint';

const loginSchema = z.object({
  state: z.string().min(1),
  codeVerifier: z.string().min(1),
  returnPath: z.string().startsWith('/'),
});

type Login = z.infer<typeof loginSchema>;

type Tokens = openIdClient.TokenEndpointResponse & openIdClient.TokenEndpointResponseHelpers;

const keycloakSessionLifetimeSchema = z.int().positive();

export function toSafeReturnPath(returnTo: string | null, publicUrl: string): string {
  const homeUrl = new URL('/', publicUrl);
  const target = new URL(returnTo ?? '/', homeUrl);
  const isPathOfThisSite = target.origin === homeUrl.origin && !target.pathname.startsWith('//');
  return isPathOfThisSite ? `${target.pathname}${target.search}` : '/';
}

function createOpenIdConfiguration(
  configuration: ConsumerWebConfiguration,
): openIdClient.Configuration {
  const { keycloakIssuerUrl, keycloakTokenUrl, clientSecret } = configuration;
  const openIdConfiguration = new openIdClient.Configuration(
    {
      issuer: keycloakIssuerUrl,
      [authorizationEndpointField]: `${keycloakIssuerUrl}/protocol/openid-connect/auth`,
      [tokenEndpointField]: keycloakTokenUrl,
      [endSessionEndpointField]: `${keycloakIssuerUrl}/protocol/openid-connect/logout`,
    },
    clientId,
    clientSecret,
  );
  openIdClient.allowInsecureRequests(openIdConfiguration);
  return openIdConfiguration;
}

function requireIdToken(idToken: string | undefined): string {
  if (idToken === undefined) throw new Error('Keycloak answered the sign-in without an ID token');
  return idToken;
}

function toSession(tokens: Tokens): Session {
  const nowInMilliseconds = Date.now();
  const keycloakSessionLifetimeInSeconds = keycloakSessionLifetimeSchema.parse(
    tokens['refresh_expires_in'],
  );
  return {
    accessToken: tokens.access_token,
    idToken: requireIdToken(tokens.id_token),
    accessTokenExpiresAtInMilliseconds:
      nowInMilliseconds + (tokens.expiresIn() ?? 0) * millisecondsPerSecond,
    expiresAtInMilliseconds:
      nowInMilliseconds + keycloakSessionLifetimeInSeconds * millisecondsPerSecond,
  };
}

function setLoginCookie(response: NextResponse, secret: string, login: Login): void {
  response.cookies.set({
    name: loginCookieName,
    value: sealCookieValue(secret, loginCookieName, login),
    httpOnly: true,
    secure: true,
    sameSite: 'lax',
    path: loginCookiePath,
    maxAge: loginLifetimeInSeconds,
  });
}

export async function startLogin(returnTo: string | null): Promise<NextResponse> {
  const configuration = readConsumerWebConfiguration(process.env);
  const state = openIdClient.randomState();
  const codeVerifier = openIdClient.randomPKCECodeVerifier();
  const parameters = new URLSearchParams([
    ['redirect_uri', new URL(loginCookiePath, configuration.publicUrl).href],
    ['scope', 'openid'],
    ['code_challenge', await openIdClient.calculatePKCECodeChallenge(codeVerifier)],
    ['code_challenge_method', 'S256'],
    ['state', state],
  ]);
  const openIdConfiguration = createOpenIdConfiguration(configuration);
  const response = NextResponse.redirect(
    openIdClient.buildAuthorizationUrl(openIdConfiguration, parameters),
  );
  const returnPath = toSafeReturnPath(returnTo, configuration.publicUrl);
  setLoginCookie(response, configuration.sessionSecret, { state, codeVerifier, returnPath });
  return response;
}

export async function completeLogin(request: NextRequest): Promise<NextResponse> {
  const configuration = readConsumerWebConfiguration(process.env);
  const sealedLogin = request.cookies.get(loginCookieName)?.value ?? '';
  const login = loginSchema.safeParse(
    openCookieValue(configuration.sessionSecret, loginCookieName, sealedLogin),
  );
  if (!login.success)
    return new NextResponse('The sign-in expired. Start it again.', { status: 400 });
  const { codeVerifier, state, returnPath } = login.data;
  const tokens = await openIdClient.authorizationCodeGrant(
    createOpenIdConfiguration(configuration),
    new URL(`${loginCookiePath}${request.nextUrl.search}`, configuration.publicUrl),
    { pkceCodeVerifier: codeVerifier, expectedState: state },
  );
  const response = NextResponse.redirect(new URL(returnPath, configuration.publicUrl), 303);
  response.cookies.delete({ name: loginCookieName, path: loginCookiePath });
  setSessionCookie(response, configuration.sessionSecret, toSession(tokens));
  return response;
}

export function logout(request: NextRequest): NextResponse {
  const configuration = readConsumerWebConfiguration(process.env);
  if (request.headers.get('origin') !== new URL(configuration.publicUrl).origin) {
    return new NextResponse('Sign out from a page of this site.', { status: 403 });
  }
  const sealedSession = request.cookies.get(sessionCookieName)?.value;
  const session = openSession(configuration.sessionSecret, sealedSession, Date.now());
  const homeUrl = new URL('/', configuration.publicUrl).href;
  const parameters = new URLSearchParams([['post_logout_redirect_uri', homeUrl]]);
  if (session !== undefined) parameters.set('id_token_hint', session.idToken);
  const endSessionUrl = openIdClient.buildEndSessionUrl(
    createOpenIdConfiguration(configuration),
    parameters,
  );
  const response = NextResponse.redirect(endSessionUrl, 303);
  response.cookies.delete(sessionCookieName);
  return response;
}
