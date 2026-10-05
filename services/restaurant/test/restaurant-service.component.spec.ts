import { setTimeout as delay } from 'node:timers/promises';
import { create, fromBinary } from '@bufbuild/protobuf';
import {
  Code,
  ConnectError,
  createClient,
  type Client,
  type Interceptor,
} from '@connectrpc/connect';
import { createConnectTransport } from '@connectrpc/connect-node';
import { createTokenExchange } from '@fd/chassis-auth';
import { createKafka } from '@fd/chassis-kafka';
import { createDatabase } from '@fd/chassis-postgres';
import {
  recordSpans,
  SpanStatusCode,
  startKafkaContainer,
  startKeycloakContainer,
  startOpenSearchContainer,
  startPostgresContainer,
  type StartedKafka,
  type StartedKeycloak,
  type StartedOpenSearch,
  type StartedPostgres,
} from '@fd/chassis-testing';
import { RestaurantCatalogueService } from '@fd/contracts/fooddelivery/restaurant/v1/catalogue_pb.js';
import {
  DayOfWeek,
  MenuRevisedSchema,
} from '@fd/contracts/fooddelivery/restaurant/v1/events_pb.js';
import {
  MembershipRole,
  OnboardRestaurantRequestSchema,
  RestaurantService,
  ReviseMenuFailureSchema,
} from '@fd/contracts/fooddelivery/restaurant/v1/service_pb.js';
import { sql, type Kysely } from 'kysely';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { RestaurantServiceConfiguration } from '../src/infrastructure/restaurant-service.config.ts';
import {
  rebuildSearchIndex,
  startRestaurantService,
  type RunningRestaurantService,
} from '../src/main.ts';

interface OutboxRow {
  readonly id: string;
  readonly topic: string;
  readonly aggregateId: string;
  readonly messageType: string;
  readonly payload: Uint8Array;
  readonly correlationId: string;
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
const spans = recordSpans();

let postgres: StartedPostgres;
let keycloak: StartedKeycloak;
let kafka: StartedKafka;
let openSearch: StartedOpenSearch;
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
    kafkaBootstrapServers: [kafka.bootstrapServer],
    openSearchUrl: openSearch.url,
    ...overrides,
  };
}

async function readOutbox(restaurantId: string): Promise<readonly OutboxRow[]> {
  const result = await sql<OutboxRow>`
    select id, topic, aggregate_id, message_type, payload, correlation_id, actor_id from outbox
    where aggregate_id = ${restaurantId} order by id
  `.execute(outboxReader);
  return result.rows;
}

async function createStateTopics(): Promise<void> {
  const admin = createKafka({
    clientId: 'component-test',
    bootstrapServers: [kafka.bootstrapServer],
  }).admin();
  await admin.connect();
  await admin.createTopics({
    topics: [
      'restaurant.restaurant.state',
      'restaurant.restaurant.state.restaurant-service.dlq',
    ].map((topic) => ({ topic, numPartitions: 1, replicationFactor: 1 })),
  });
  await admin.disconnect();
}

async function relayOutboxToKafka(restaurantId: string): Promise<void> {
  const producer = createKafka({
    clientId: 'outbox-relay-double',
    bootstrapServers: [kafka.bootstrapServer],
  }).producer();
  await producer.connect();
  await producer.send({
    topic: 'restaurant.restaurant.state',
    messages: (await readOutbox(restaurantId)).map((row) => ({
      key: row.aggregateId,
      value: Buffer.from(row.payload),
      headers: {
        'message-id': row.id,
        'message-type': row.messageType,
        'correlation-id': row.correlationId,
      },
    })),
  });
  await producer.disconnect();
}

const unreadableStateMessageId = '0199a5d0-0000-7000-8000-0000000000f1';

async function publishUnreadableStateRecord(restaurantId: string): Promise<void> {
  const producer = createKafka({
    clientId: 'unreadable-state-producer',
    bootstrapServers: [kafka.bootstrapServer],
  }).producer();
  await producer.connect();
  await producer.send({
    topic: 'restaurant.restaurant.state',
    messages: [
      {
        key: restaurantId,
        value: Buffer.of(0xff),
        headers: {
          'message-id': unreadableStateMessageId,
          'message-type': MenuRevisedSchema.typeName,
          'correlation-id': '0199a5d0-0000-7000-8000-0000000000f2',
        },
      },
    ],
  });
  await producer.disconnect();
}

async function readFirstStateDeadLetterMessageId(): Promise<string | undefined> {
  const reader = createKafka({
    clientId: 'dead-letter-reader',
    bootstrapServers: [kafka.bootstrapServer],
  }).consumer({ kafkaJS: { groupId: 'dead-letter-reader', fromBeginning: true } });
  await reader.connect();
  await reader.subscribe({ topic: 'restaurant.restaurant.state.restaurant-service.dlq' });
  const messageIds: string[] = [];
  await reader.run({
    eachMessage: ({ message }) => {
      messageIds.push(message.headers?.['message-id']?.toString() ?? 'no message id');
      return Promise.resolve();
    },
  });
  try {
    const deadline = Date.now() + 30_000;
    while (messageIds.length === 0 && Date.now() < deadline) await delay(250);
    return messageIds[0];
  } finally {
    await reader.disconnect();
  }
}

function publicCatalogueClient(): Client<typeof RestaurantCatalogueService> {
  return createClient(
    RestaurantCatalogueService,
    createConnectTransport({ baseUrl: restaurantService.url, httpVersion: '1.1' }),
  );
}

async function waitForSearchHit(text: string, restaurantId: string): Promise<string> {
  const deadline = Date.now() + 30_000;
  while (Date.now() < deadline) {
    const { hits } = await publicCatalogueClient().searchRestaurants({ text, limit: 50 });
    const hit = hits.find((found) => found.restaurantId === restaurantId);
    if (hit !== undefined) return hit.name;
    await delay(250);
  }
  throw new Error(`${restaurantId} was not found by "${text}" in time`);
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

async function createEmptyDatabase(databaseName: string): Promise<string> {
  await sql`create database ${sql.id(databaseName)}`.execute(outboxReader);
  const databaseUrl = new URL(postgres.connectionUri);
  databaseUrl.pathname = `/${databaseName}`;
  return databaseUrl.toString();
}

async function createDatabaseThatFailsMigrations(databaseName: string): Promise<string> {
  const databaseUrl = await createEmptyDatabase(databaseName);
  const conflicting = createDatabase({
    connectionString: databaseUrl,
    maximumConnectionCount: 1,
    onConnectionError: () => undefined,
  });
  await sql`create table restaurants (restaurant_id integer)`.execute(conflicting);
  await conflicting.destroy();
  return databaseUrl;
}

async function waitForHousekeepingRun(): Promise<void> {
  const deadline = Date.now() + 5_000;
  while (spans.spansNamed('housekeeping').length === 0 && Date.now() < deadline) {
    await delay(100);
  }
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
  [postgres, keycloak, kafka, openSearch] = await Promise.all([
    started(startPostgresContainer()),
    started(startKeycloakContainer()),
    started(startKafkaContainer()),
    started(startOpenSearchContainer()),
  ]);
  await createStateTopics();
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
    const revision = await staffBClient.reviseMenu({ restaurantId, menuItems: [margherita] }).then(
      () => undefined,
      (rejection: unknown) => ConnectError.from(rejection),
    );
    expect(revision?.code).toBe(Code.PermissionDenied);
    expect(revision?.findDetails(ReviseMenuFailureSchema).at(0)?.reason).toBe(
      'NotRestaurantMember',
    );
  });

  it('refuses a token issued for another audience as unauthenticated', async () => {
    const restaurantBffToken = await keycloak.signIn('staff-a');

    await expect(clientFor(restaurantBffToken).listMemberships({})).rejects.toMatchObject({
      code: Code.Unauthenticated,
    });
  });

  it('projects the snapshots its outbox relays past a state record it dead-letters', async () => {
    const { restaurantId } = await staffAClient.onboardRestaurant({
      ...pizzeria,
      name: 'Cantina Leonardo',
    });
    await staffAClient.reviseMenu({
      restaurantId,
      menuItems: [{ ...margherita, name: 'Moqueca' }],
    });

    await publishUnreadableStateRecord(restaurantId);
    await relayOutboxToKafka(restaurantId);

    expect(await waitForSearchHit('leoanrdo', restaurantId)).toBe('Cantina Leonardo');
    expect(await waitForSearchHit('moqueca', restaurantId)).toBe('Cantina Leonardo');
    expect(await readFirstStateDeadLetterMessageId()).toBe(unreadableStateMessageId);
  });

  it('answers the public catalogue without an access token while staff calls still need one', async () => {
    const { restaurantId } = await staffAClient.onboardRestaurant(pizzeria);
    await staffAClient.reviseMenu({ restaurantId, menuItems: [margherita] });
    const anonymousStaffClient = createClient(
      RestaurantService,
      createConnectTransport({ baseUrl: restaurantService.url, httpVersion: '1.1' }),
    );

    const { restaurant } = await publicCatalogueClient().getPublicRestaurant({ restaurantId });

    expect(restaurant).toMatchObject({ restaurantId, version: 2, menuItems: [margherita] });
    await expect(anonymousStaffClient.listMemberships({})).rejects.toMatchObject({
      code: Code.Unauthenticated,
    });
  });

  it('rebuilds the search index from every restaurant stored in Postgres', async () => {
    const { restaurantId } = await staffAClient.onboardRestaurant({
      ...pizzeria,
      name: 'Sushi Bar',
    });
    const storedCount = await sql<{ readonly restaurantCount: bigint }>`
      select count(*) as restaurant_count from restaurants
    `.execute(outboxReader);

    const restaurantCount = await rebuildSearchIndex(serviceConfiguration());

    expect(restaurantCount).toBe(Number(storedCount.rows[0]?.restaurantCount));
    expect(await waitForSearchHit('sushi', restaurantId)).toBe('Sushi Bar');
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

  it('releases its database connections when its port is taken', async () => {
    const databaseName = 'restaurant_port_taken';
    const databaseUrl = await createEmptyDatabase(databaseName);

    const failedStart = startRestaurantService(
      serviceConfiguration({ databaseUrl, port: Number(new URL(restaurantService.url).port) }),
    );

    await expect(failedStart).rejects.toThrow('EADDRINUSE');
    expect(await waitUntilNoConnectionTo(databaseName)).toBe(0);
  });

  it('stops answering its health endpoint, running housekeeping and holding database connections once stopped', async () => {
    const databaseName = 'restaurant_stopped';
    const databaseUrl = await createEmptyDatabase(databaseName);
    const stoppableService = await startRestaurantService(
      serviceConfiguration({ databaseUrl, housekeepingIntervalInMilliseconds: 100 }),
    );
    const healthUrl = `${stoppableService.url}/health`;
    expect((await fetch(healthUrl)).status).toBe(200);
    await waitForHousekeepingRun();

    await stoppableService.stop();
    const housekeepingRuns = spans.spansNamed('housekeeping');

    expect(housekeepingRuns).not.toHaveLength(0);
    await expect(fetch(healthUrl)).rejects.toThrow('fetch failed');
    expect(await waitUntilNoConnectionTo(databaseName)).toBe(0);
    await delay(500);
    expect(spans.spansNamed('housekeeping')).toHaveLength(housekeepingRuns.length);
    expect(housekeepingRuns.map((run) => run.status.code)).not.toContain(SpanStatusCode.ERROR);
  });
});
