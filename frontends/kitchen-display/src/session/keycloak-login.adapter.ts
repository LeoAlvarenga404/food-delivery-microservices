import * as openIdClient from 'openid-client';
import { z } from 'zod';

export interface SignInSettings {
  readonly keycloakIssuerUrl: string;
  readonly redirectUrl: string;
  readonly storage: Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;
}

export interface SignedIn {
  readonly accessToken: string;
  readonly idToken: string;
  readonly returnPath: string;
}

const clientId = 'kitchen-display';
const pendingSignInKey = 'kitchen-display-sign-in';
const authorizationEndpointField = 'authorization_endpoint';
const tokenEndpointField = 'token_endpoint';
const endSessionEndpointField = 'end_session_endpoint';
const keySetField = 'jwks_uri';
const issuerParameterField = 'authorization_response_iss_parameter_supported';

const pendingSignInSchema = z.object({
  state: z.string().min(1),
  codeVerifier: z.string().min(1),
  returnPath: z.string().startsWith('/'),
});

function createOpenIdConfiguration(keycloakIssuerUrl: string): openIdClient.Configuration {
  const endpointUrl = `${keycloakIssuerUrl}/protocol/openid-connect`;
  const openIdConfiguration = new openIdClient.Configuration(
    {
      issuer: keycloakIssuerUrl,
      [authorizationEndpointField]: `${endpointUrl}/auth`,
      [tokenEndpointField]: `${endpointUrl}/token`,
      [endSessionEndpointField]: `${endpointUrl}/logout`,
      [keySetField]: `${endpointUrl}/certs`,
      [issuerParameterField]: true,
    },
    clientId,
    undefined,
    openIdClient.None(),
  );
  openIdClient.allowInsecureRequests(openIdConfiguration);
  openIdClient.enableNonRepudiationChecks(openIdConfiguration);
  return openIdConfiguration;
}

function readPendingSignIn(
  storage: SignInSettings['storage'],
): z.infer<typeof pendingSignInSchema> | undefined {
  const stored = storage.getItem(pendingSignInKey);
  storage.removeItem(pendingSignInKey);
  const pending = pendingSignInSchema.safeParse(stored === null ? undefined : JSON.parse(stored));
  return pending.success ? pending.data : undefined;
}

function requireIdToken(idToken: string | undefined): string {
  if (idToken === undefined) throw new Error('Keycloak answered the sign-in without an ID token');
  return idToken;
}

export async function startSignIn(settings: SignInSettings, returnPath: string): Promise<URL> {
  const state = openIdClient.randomState();
  const codeVerifier = openIdClient.randomPKCECodeVerifier();
  const parameters = new URLSearchParams([
    ['redirect_uri', settings.redirectUrl],
    ['scope', 'openid'],
    ['code_challenge', await openIdClient.calculatePKCECodeChallenge(codeVerifier)],
    ['code_challenge_method', 'S256'],
    ['state', state],
  ]);
  settings.storage.setItem(pendingSignInKey, JSON.stringify({ state, codeVerifier, returnPath }));
  const openIdConfiguration = createOpenIdConfiguration(settings.keycloakIssuerUrl);
  return openIdClient.buildAuthorizationUrl(openIdConfiguration, parameters);
}

export async function completeSignIn(
  settings: SignInSettings,
  currentUrl: URL,
): Promise<SignedIn | undefined> {
  const pending = readPendingSignIn(settings.storage);
  if (pending === undefined || !currentUrl.searchParams.has('code')) return undefined;
  const tokens = await openIdClient.authorizationCodeGrant(
    createOpenIdConfiguration(settings.keycloakIssuerUrl),
    currentUrl,
    { pkceCodeVerifier: pending.codeVerifier, expectedState: pending.state },
  );
  return {
    accessToken: tokens.access_token,
    idToken: requireIdToken(tokens.id_token),
    returnPath: pending.returnPath,
  };
}

export function buildSignOutUrl(settings: SignInSettings, idToken: string): URL {
  return openIdClient.buildEndSessionUrl(
    createOpenIdConfiguration(settings.keycloakIssuerUrl),
    new URLSearchParams([
      ['post_logout_redirect_uri', settings.redirectUrl],
      ['id_token_hint', idToken],
    ]),
  );
}
