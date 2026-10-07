import { fileURLToPath } from 'node:url';
import { GenericContainer, Wait, type StartedTestContainer } from 'testcontainers';
import { findFreePort } from './free-port.ts';

export interface StartedKeycloak {
  readonly issuer: string;
  readonly jwksUrl: string;
  readonly tokenUrl: string;
  readonly consumerBffClientSecret: string;
  readonly restaurantBffClientSecret: string;
  readonly signIn: (username: string) => Promise<string>;
  readonly stop: () => Promise<void>;
}

const keycloakImage = 'quay.io/keycloak/keycloak:26.7.5';
const realmFilePath = fileURLToPath(
  new URL('../../../../infra/keycloak/food-delivery-realm.json', import.meta.url),
);
const consumerBffClientSecret = 'test-consumer-bff-secret';
const restaurantBffClientSecret = 'test-restaurant-bff-secret';
const keycloakPort = 8080;
const keycloakStartupTimeoutInMilliseconds = 150_000;

function readAccessToken(body: unknown): string | undefined {
  if (typeof body !== 'object' || body === null || !('access_token' in body)) return undefined;
  return typeof body.access_token === 'string' ? body.access_token : undefined;
}

async function signIn(tokenUrl: string, username: string): Promise<string> {
  const response = await fetch(tokenUrl, {
    method: 'POST',
    body: new URLSearchParams([
      ['grant_type', 'password'],
      ['client_id', 'e2e'],
      ['username', username],
      ['password', `${username}-password`],
    ]),
  });
  const accessToken = readAccessToken(await response.json());
  if (accessToken === undefined) {
    throw new Error(`${username} could not sign in: HTTP ${String(response.status)}`);
  }
  return accessToken;
}

function startContainer(hostPort: number, baseUrl: string): Promise<StartedTestContainer> {
  return new GenericContainer(keycloakImage)
    .withExposedPorts({ container: keycloakPort, host: hostPort })
    .withEnvironment({
      KC_HOSTNAME: baseUrl,
      KC_HOSTNAME_BACKCHANNEL_DYNAMIC: 'true',
      JAVA_OPTS_KC_HEAP: '-Xms64m -Xmx320m',
      CONSUMER_BFF_CLIENT_SECRET: consumerBffClientSecret,
      RESTAURANT_BFF_CLIENT_SECRET: restaurantBffClientSecret,
    })
    .withCopyFilesToContainer([
      { source: realmFilePath, target: '/opt/keycloak/data/import/food-delivery-realm.json' },
    ])
    .withCommand(['start-dev', '--import-realm'])
    .withStartupTimeout(keycloakStartupTimeoutInMilliseconds)
    .withWaitStrategy(
      Wait.forHttp('/realms/food-delivery/.well-known/openid-configuration', keycloakPort),
    )
    .start();
}

export async function startKeycloakContainer(): Promise<StartedKeycloak> {
  const hostPort = await findFreePort();
  const baseUrl = `http://127.0.0.1:${String(hostPort)}`;
  const container = await startContainer(hostPort, baseUrl);
  const issuer = `${baseUrl}/realms/food-delivery`;
  const tokenUrl = `${issuer}/protocol/openid-connect/token`;
  return {
    issuer,
    jwksUrl: `${issuer}/protocol/openid-connect/certs`,
    tokenUrl,
    consumerBffClientSecret,
    restaurantBffClientSecret,
    signIn: (username) => signIn(tokenUrl, username),
    stop: async () => {
      await container.stop();
    },
  };
}
