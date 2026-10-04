import { setTimeout as delay } from 'node:timers/promises';
import { create, fromBinary } from '@bufbuild/protobuf';
import { Code, createClient, type Client, type Interceptor } from '@connectrpc/connect';
import { createConnectTransport } from '@connectrpc/connect-node';
import { createTokenExchange } from '@fd/chassis-auth';
import { createDatabase } from '@fd/chassis-postgres';
import {
  startKeycloakContainer,
  startPostgresContainer,
  type StartedKeycloak,
  type StartedPostgres,
} from '@fd/chassis-testing';
import {
  DayOfWeek,
  MenuRevisedSchema,
} from '@fd/contracts/fooddelivery/restaurant/v1/events_pb.js';
import {
  MembershipRole,
  OnboardRestaurantRequestSchema,
  RestaurantService,
} from '@fd/contracts/fooddelivery/restaurant/v1/service_pb.js';
import { sql, type Kysely } from 'kysely';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { RestaurantServiceConfiguration } from '../src/infrastructure/restaurant-service.config.ts';
import { startRestaurantService, type RunningRestaurantService } from '../src/main.ts';

interface OutboxRow {
  readonly topic: string;
  readonly aggregateId: string;
  readonly payload: Uint8Array;
  readonly actorId: string | null;
}

const staffAId = '0199a5d0-0000-7000-8000-0000000000e1';
const margherita = {
  menuItemId: '0199a5d0-0000-7000-8000-000000000d01',
  name: 'Margherita',
  priceInCents: 4500n,
  isAvailable: true,
};
const pizzeria = create(OnboardRestaurantRequestSchema, {
  name: 'Pizzaria Bella',
  category: 'Pizza',
  address: {
    street: 'Avenida Paulista',
    number: '1000',
    city: 'Sao Paulo',
    postalCode: '01310-100',
    location: { latitude: -23.5614, longitude: -46.6559 },
  },
  timeZone: 'America/Sao_Paulo',
  openingHours: [{ dayOfWeek: DayOfWeek.FRIDAY, opensAt: '18:00', closesAt: '23:30' }],
  minimumOrderInCents: 2000n,
});

let postgres: StartedPostgres;
let keycloak: StartedKeycloak;
let restaurantService: RunningRestaurantService;
let staffAClient: Client<typeof RestaurantService>;
let outboxReader: Kysely<unknown>;
const stoppers: (() => Promise<void>)[] = [];

function sendingAccessToken(accessToken: string): Interceptor {
  return (next) => (request) => {
    request.header.set('authorization', `Bearer ${accessToken}`);
    return next(request);
  };
}

function clientFor(accessToken: string): Client<typeof RestaurantService> {
  return createClient(
    RestaurantService,
    createConnectTransport({
      baseUrl: restaurantService.url,
      httpVersion: '1.1',
      interceptors: [sendingAccessToken(accessToken)],
    }),
  );
}

async function restaurantServiceTokenOf(username: string): Promise<string> {
  const exchange = createTokenExchange({
    tokenUrl: keycloak.tokenUrl,
    clientId: 'restaurant-bff',
    clientSecret: keycloak.restaurantBffClientSecret,
  });
  const exchanged = await exchange(await keycloak.signIn(username), 'restaurant-service');
  if (exchanged.isLeft()) throw new Error(`exchange refused: ${exchanged.failure.error}`);
  return exchanged.success;
}

function serviceConfiguration(
  overrides: Partial<RestaurantServiceConfiguration> = {},
): RestaurantServiceConfiguration {
  return {
    databaseUrl: postgres.connectionUri,
    host: '127.0.0.1',
    port: 0,
    logLevel: 'silent',
    housekeepingIntervalInMilliseconds: 3_600_000,
    accessTokenIssuer: keycloak.issuer,
    accessTokenJwksUrl: keycloak.jwksUrl,
    ...overrides,
  };
}

async function readOutbox(restaurantId: string): Promise<readonly OutboxRow[]> {
  const result = await sql<OutboxRow>`
    select topic, aggregate_id, payload, actor_id from outbox
    where aggregate_id = ${restaurantId} order by id
  `.execute(outboxReader);
  return result.rows;
}

async function countConnectionsTo(databaseName: string): Promise<number> {
  const result = await sql<{ readonly connectionCount: bigint }>`
    select count(*) as connection_count from pg_stat_activity where datname = ${databaseName}
  `.execute(outboxReader);
  return Number(result.rows[0]?.connectionCount);
}

async function waitUntilNoConnectionTo(databaseName: string): Promise<number> {
  const deadline = Date.now() + 5_000;
  let connectionCount = await countConnectionsTo(databaseName);
  while (connectionCount > 0 && Date.now() < deadline) {
    await delay(200);
    connectionCount = await countConnectionsTo(databaseName);
  }
  return connectionCount;
}

async function createDatabaseThatFailsMigrations(databaseName: string): Promise<string> {
  await sql`create database ${sql.id(databaseName)}`.execute(outboxReader);
  const databaseUrl = new URL(postgres.connectionUri);
  databaseUrl.pathname = `/${databaseName}`;
  const conflicting = createDatabase({
    connectionString: databaseUrl.toString(),
    maximumConnectionCount: 1,
    onConnectionError: () => undefined,
  });
  await sql`create table restaurants (restaurant_id integer)`.execute(conflicting);
  await conflicting.destroy();
  return databaseUrl.toString();
}

function started<Started extends { readonly stop: () => Promise<void> }>(
  starting: Promise<Started>,
): Promise<Started> {
  return starting.then((resource) => {
    stoppers.push(() => resource.stop());
    return resource;
  });
}

beforeAll(async () => {
  [postgres, keycloak] = await Promise.all([
    started(startPostgresContainer()),
    started(startKeycloakContainer()),
  ]);
  restaurantService = await started(startRestaurantService(serviceConfiguration()));
  outboxReader = createDatabase({
    connectionString: postgres.connectionUri,
    maximumConnectionCount: 1,
    onConnectionError: () => undefined,
  });
  stoppers.push(() => outboxReader.destroy());
  staffAClient = clientFor(await restaurantServiceTokenOf('staff-a'));
});

afterAll(async () => {
  const failures: unknown[] = [];
  for (const stop of stoppers.reverse()) {
    try {
      await stop();
    } catch (error) {
      failures.push(error);
    }
  }
  if (failures.length > 0) throw new AggregateError(failures, 'stopping the component test failed');
});

describe('restaurant service', () => {
  it('onboards and revises a restaurant for the staff member of a restaurant service token', async () => {
    const { restaurantId } = await staffAClient.onboardRestaurant(pizzeria);

    const revision = await staffAClient.reviseMenu({ restaurantId, menuItems: [margherita] });

    expect(revision.version).toBe(2);
    expect((await staffAClient.getRestaurant({ restaurantId })).restaurant).toMatchObject({
      restaurantId,
      version: 2,
      menuItems: [margherita],
    });
    expect((await staffAClient.listMemberships({})).memberships).toContainEqual(
      expect.objectContaining({ restaurantId, role: MembershipRole.OWNER }),
    );
  });

  it('writes each snapshot to its outbox for the state topic, keyed by the restaurant', async () => {
    const { restaurantId } = await staffAClient.onboardRestaurant(pizzeria);
    await staffAClient.reviseMenu({ restaurantId, menuItems: [margherita] });

    const outbox = await readOutbox(restaurantId);

    expect(
      outbox.map(({ topic, aggregateId, actorId }) => ({ topic, aggregateId, actorId })),
    ).toEqual([
      { topic: 'restaurant.restaurant.state', aggregateId: restaurantId, actorId: staffAId },
      { topic: 'restaurant.restaurant.state', aggregateId: restaurantId, actorId: staffAId },
    ]);
    expect(
      outbox.map((row) => fromBinary(MenuRevisedSchema, row.payload).restaurant?.version),
    ).toEqual([1, 2]);
  });

  it('refuses another staff member the restaurant of staff a', async () => {
    const { restaurantId } = await staffAClient.onboardRestaurant(pizzeria);
    const staffBClient = clientFor(await restaurantServiceTokenOf('staff-b'));

    await expect(staffBClient.getRestaurant({ restaurantId })).rejects.toMatchObject({
      code: Code.PermissionDenied,
    });
    await expect(
      staffBClient.reviseMenu({ restaurantId, menuItems: [margherita] }),
    ).rejects.toMatchObject({ code: Code.PermissionDenied });
  });

  it('refuses a token issued for another audience as unauthenticated', async () => {
    const restaurantBffToken = await keycloak.signIn('staff-a');

    await expect(clientFor(restaurantBffToken).listMemberships({})).rejects.toMatchObject({
      code: Code.Unauthenticated,
    });
  });

  it('answers its health endpoint', async () => {
    const response = await fetch(`${restaurantService.url}/health`);

    expect(response.status).toBe(200);
  });

  it('releases its database connections when it fails to start', async () => {
    const databaseName = 'restaurant_start_failure';
    const databaseUrl = await createDatabaseThatFailsMigrations(databaseName);

    const failedStart = startRestaurantService(serviceConfiguration({ databaseUrl }));

    await expect(failedStart).rejects.toThrow();
    expect(await waitUntilNoConnectionTo(databaseName)).toBe(0);
  });
});
