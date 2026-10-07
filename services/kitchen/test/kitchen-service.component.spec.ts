import { setTimeout as delay } from 'node:timers/promises';
import {
  create,
  fromBinary,
  toBinary,
  type DescMessage,
  type MessageInitShape,
} from '@bufbuild/protobuf';
import { timestampDate } from '@bufbuild/protobuf/wkt';
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
  startPostgresContainer,
  traceparentOf,
  type StartedKafka,
  type StartedKeycloak,
  type StartedPostgres,
} from '@fd/chassis-testing';
import {
  ApproveTicketSchema,
  CreateTicketSchema,
} from '@fd/contracts/fooddelivery/kitchen/v1/commands_pb.js';
import {
  TicketApprovedSchema,
  TicketCreatedSchema,
} from '@fd/contracts/fooddelivery/kitchen/v1/replies_pb.js';
import {
  KitchenService,
  TicketCommandFailureSchema,
  TicketStatus,
} from '@fd/contracts/fooddelivery/kitchen/v1/service_pb.js';
import { MenuRevisedSchema } from '@fd/contracts/fooddelivery/restaurant/v1/events_pb.js';
import { sql, type Kysely } from 'kysely';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { KitchenServiceConfiguration } from '../src/infrastructure/kitchen-service.config.ts';
import { startKitchenService, type RunningKitchenService } from '../src/main.ts';

interface ReplyRow {
  readonly messageType: string;
  readonly sagaId: string | null;
  readonly traceparent: string | null;
  readonly payload: Uint8Array;
}

const commandsTopic = 'kitchen.commands';
const restaurantStateTopic = 'restaurant.restaurant.state';
const orderId = '0199a5d0-0000-7000-8000-0000000000a1';
const sagaId = '0199a5d0-0000-7000-8000-0000000000b1';
const waitLimitInMilliseconds = 30_000;
const housekeepingIntervalInMilliseconds = 3_600_000;
const commandTraceId = '4bf92f3577b34da6a3ce929d0e0e4736';
const staffAId = '0199a5d0-0000-7000-8000-0000000000e1';
const spans = recordSpans();

let postgres: StartedPostgres;
let kafka: StartedKafka;
let keycloak: StartedKeycloak;
let kitchenService: RunningKitchenService;
let outboxReader: Kysely<unknown>;
const stoppers: (() => Promise<void>)[] = [];

async function waitFor<Result>(
  probe: () => Promise<Result | undefined>,
  limitInMilliseconds = waitLimitInMilliseconds,
): Promise<Result> {
  const deadline = Date.now() + limitInMilliseconds;
  while (Date.now() < deadline) {
    const result = await probe();
    if (result !== undefined) return result;
    await delay(200);
  }
  throw new Error('condition not met in time');
}

function serviceConfiguration(
  overrides: Partial<KitchenServiceConfiguration> = {},
): KitchenServiceConfiguration {
  return {
    databaseUrl: postgres.connectionUri,
    kafkaBootstrapServers: [kafka.bootstrapServer],
    host: '127.0.0.1',
    port: 0,
    logLevel: 'silent',
    housekeepingIntervalInMilliseconds,
    accessTokenIssuer: keycloak.issuer,
    accessTokenJwksUrl: keycloak.jwksUrl,
    ...overrides,
  };
}

function sendingAccessToken(accessToken: string): Interceptor {
  return (next) => (request) => {
    request.header.set('authorization', `Bearer ${accessToken}`);
    return next(request);
  };
}

async function kitchenClientFor(
  username: string,
  audience = 'kitchen-service',
): Promise<Client<typeof KitchenService>> {
  const exchange = createTokenExchange({
    tokenUrl: keycloak.tokenUrl,
    clientId: 'restaurant-bff',
    clientSecret: keycloak.restaurantBffClientSecret,
  });
  const exchanged = await exchange(await keycloak.signIn(username), audience);
  if (exchanged.isLeft()) throw new Error(`exchange refused: ${exchanged.failure.error}`);
  return createClient(
    KitchenService,
    createConnectTransport({
      baseUrl: kitchenService.url,
      httpVersion: '1.1',
      interceptors: [sendingAccessToken(exchanged.success)],
    }),
  );
}

async function rejectionOf(call: Promise<unknown>): Promise<ConnectError> {
  return ConnectError.from(
    await call.then(
      () => undefined,
      (rejection: unknown) => rejection,
    ),
  );
}

async function waitForMembers(restaurantId: string): Promise<unknown> {
  return waitFor(async () => {
    const result = await sql<{ readonly staffMemberIds: unknown }>`
      select staff_member_ids from restaurant_memberships where restaurant_id = ${restaurantId}
    `.execute(outboxReader);
    return result.rows[0]?.staffMemberIds;
  });
}

async function placeApprovedTicket(restaurantId: string, ticketOrderId: string): Promise<void> {
  const createMessageId = '0199a5d0-0000-7000-8000-000000000c01';
  const approveMessageId = '0199a5d0-0000-7000-8000-000000000c02';
  await sendCommand(
    CreateTicketSchema,
    {
      orderId: ticketOrderId,
      restaurantId,
      consumerId: '0199a5d0-0000-7000-8000-0000000000c1',
      lineItems: [
        { menuItemId: '0199a5d0-0000-7000-8000-000000000101', name: 'Margherita', quantity: 1 },
      ],
    },
    createMessageId,
  );
  await waitForReplyTo(createMessageId);
  await sendCommand(ApproveTicketSchema, { orderId: ticketOrderId }, approveMessageId);
  await waitForReplyTo(approveMessageId);
}

async function createSubscribedTopics(): Promise<void> {
  const admin = createKafka({
    clientId: 'component-test',
    bootstrapServers: [kafka.bootstrapServer],
  }).admin();
  await admin.connect();
  await admin.createTopics({
    topics: [commandsTopic, restaurantStateTopic]
      .flatMap((topic) => [topic, `${topic}.kitchen-service.dlq`])
      .map((topic) => ({ topic, numPartitions: 1, replicationFactor: 1 })),
  });
  await admin.disconnect();
}

async function publishMembers(
  restaurantId: string,
  staffMemberIds: readonly string[],
): Promise<void> {
  const producer = createKafka({
    clientId: 'restaurant-double',
    bootstrapServers: [kafka.bootstrapServer],
  }).producer();
  await producer.connect();
  const menuRevised = create(MenuRevisedSchema, {
    restaurant: { restaurantId, version: 1, currency: 'BRL' },
    members: staffMemberIds.map((staffMemberId) => ({ staffMemberId })),
  });
  await producer.send({
    topic: restaurantStateTopic,
    messages: [
      {
        key: restaurantId,
        value: Buffer.from(toBinary(MenuRevisedSchema, menuRevised)),
        headers: {
          'message-id': '0199a5d0-0000-7000-8000-000000000d09',
          'message-type': MenuRevisedSchema.typeName,
          'correlation-id': '0199a5d0-0000-7000-8000-0000000000e9',
        },
      },
    ],
  });
  await producer.disconnect();
}

async function sendCommand<Schema extends DescMessage>(
  schema: Schema,
  command: MessageInitShape<Schema>,
  messageId: string,
): Promise<void> {
  const producer = createKafka({
    clientId: 'order-double',
    bootstrapServers: [kafka.bootstrapServer],
  }).producer();
  await producer.connect();
  await producer.send({
    topic: commandsTopic,
    messages: [
      {
        key: orderId,
        value: Buffer.from(toBinary(schema, create(schema, command))),
        headers: {
          'message-id': messageId,
          'message-type': schema.typeName,
          'correlation-id': '0199a5d0-0000-7000-8000-0000000000e1',
          'saga-id': sagaId,
          traceparent: `00-${commandTraceId}-00f067aa0ba902b7-01`,
        },
      },
    ],
  });
  await producer.disconnect();
}

async function waitForReplyTo(messageId: string): Promise<ReplyRow> {
  return waitFor(async () => {
    const result = await sql<ReplyRow>`
      select message_type, saga_id, traceparent, payload from outbox where causation_id = ${messageId}
    `.execute(outboxReader);
    return result.rows[0];
  });
}

async function countConnectionsTo(databaseName: string): Promise<number> {
  const result = await sql<{ readonly connectionCount: bigint }>`
    select count(*) as connection_count from pg_stat_activity where datname = ${databaseName}
  `.execute(outboxReader);
  return Number(result.rows[0]?.connectionCount);
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
  await sql`create table tickets (ticket_id integer)`.execute(conflicting);
  await conflicting.destroy();
  return databaseUrl.toString();
}

beforeAll(async () => {
  [postgres, kafka, keycloak] = await Promise.all([
    startPostgresContainer().then((started) => {
      stoppers.push(() => started.stop());
      return started;
    }),
    startKafkaContainer().then((started) => {
      stoppers.push(() => started.stop());
      return started;
    }),
    startKeycloakContainer().then((started) => {
      stoppers.push(() => started.stop());
      return started;
    }),
  ]);
  await createSubscribedTopics();
  kitchenService = await startKitchenService(serviceConfiguration());
  stoppers.push(() => kitchenService.stop());
  outboxReader = createDatabase({
    connectionString: postgres.connectionUri,
    maximumConnectionCount: 1,
    onConnectionError: () => undefined,
  });
  stoppers.push(() => outboxReader.destroy());
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

describe('kitchen service', () => {
  it('creates and approves a ticket from Kafka commands and replies to the saga each time', async () => {
    const createTicketMessageId = '0199a5d0-0000-7000-8000-000000000d01';
    const approveTicketMessageId = '0199a5d0-0000-7000-8000-000000000d02';

    await sendCommand(
      CreateTicketSchema,
      {
        orderId,
        restaurantId: '0199a5d0-0000-7000-8000-000000000001',
        consumerId: '0199a5d0-0000-7000-8000-0000000000c1',
        lineItems: [
          { menuItemId: '0199a5d0-0000-7000-8000-000000000101', name: 'Margherita', quantity: 2 },
        ],
      },
      createTicketMessageId,
    );
    const ticketCreated = await waitForReplyTo(createTicketMessageId);
    await sendCommand(ApproveTicketSchema, { orderId }, approveTicketMessageId);
    const ticketApproved = await waitForReplyTo(approveTicketMessageId);

    expect([ticketCreated, ticketApproved]).toMatchObject([
      { messageType: 'fooddelivery.kitchen.v1.TicketCreated', sagaId },
      { messageType: 'fooddelivery.kitchen.v1.TicketApproved', sagaId },
    ]);
    const createdTicketId = fromBinary(TicketCreatedSchema, ticketCreated.payload).ticketId;
    expect(createdTicketId).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
    );
    expect(fromBinary(TicketApprovedSchema, ticketApproved.payload).ticketId).toBe(createdTicketId);
    expect(createdTicketId).not.toBe(orderId);
    const handled = await waitFor(() =>
      Promise.resolve(spans.spansNamed('process kitchen.commands').at(1)),
    );
    expect([ticketCreated.traceparent, ticketApproved.traceparent]).toEqual(
      spans.spansNamed('process kitchen.commands').map(traceparentOf),
    );
    expect(handled.spanContext().traceId).toBe(commandTraceId);
    expect(
      spans
        .spansNamed('process kitchen.commands')
        .map((span) => span.attributes['fooddelivery.order.id']),
    ).toEqual([orderId, orderId]);
  });

  it('keeps the members of each restaurant from the snapshots on the restaurant state topic', async () => {
    const restaurantId = '0199a5d0-0000-7000-8000-0000000000b9';
    const staffMemberIds = ['0199a5d0-0000-7000-8000-0000000000e1'];

    await publishMembers(restaurantId, staffMemberIds);

    const membership = await waitFor(async () => {
      const result = await sql<{ readonly version: number; readonly staffMemberIds: unknown }>`
        select version, staff_member_ids from restaurant_memberships where restaurant_id = ${restaurantId}
      `.execute(outboxReader);
      return result.rows[0];
    });
    expect(membership).toEqual({ version: 1, staffMemberIds });
  });

  it('lets a member list, accept, prepare and ready a ticket, publishing each step', async () => {
    const restaurantId = '0199a5d0-0000-7000-8000-0000000000b8';
    await publishMembers(restaurantId, [staffAId]);
    await placeApprovedTicket(restaurantId, '0199a5d0-0000-7000-8000-0000000000a8');
    await waitForMembers(restaurantId);
    const staffA = await kitchenClientFor('staff-a');

    const [listed] = (await staffA.listTickets({ restaurantId })).tickets;
    const ticketId = listed?.ticketId ?? '';
    const accepted = await staffA.acceptTicket({
      restaurantId,
      ticketId,
      preparationTimeInMinutes: 15,
    });
    await staffA.startPreparingTicket({ restaurantId, ticketId });
    const ready = await staffA.markTicketReady({ restaurantId, ticketId });

    expect([listed?.status, accepted.ticket?.status, ready.ticket?.status]).toEqual([
      TicketStatus.AWAITING_ACCEPTANCE,
      TicketStatus.ACCEPTED,
      TicketStatus.READY_FOR_PICKUP,
    ]);
    const readyBy = accepted.ticket?.readyBy;
    const minutesUntilReady =
      readyBy === undefined ? 0 : (timestampDate(readyBy).getTime() - Date.now()) / 60_000;
    expect(minutesUntilReady).toBeGreaterThan(14);
    expect(minutesUntilReady).toBeLessThanOrEqual(15);
    const events = await sql<{
      readonly topic: string;
      readonly messageType: string;
      readonly actorId: string;
    }>`
      select topic, message_type, actor_id from outbox where aggregate_id = ${ticketId} order by id
    `.execute(outboxReader);
    expect(events.rows).toEqual(
      [
        'fooddelivery.kitchen.v1.TicketAccepted',
        'fooddelivery.kitchen.v1.TicketPreparationStarted',
        'fooddelivery.kitchen.v1.TicketReadyForPickup',
      ].map((messageType) => ({ topic: 'kitchen.ticket.events', messageType, actorId: staffAId })),
    );
  });

  it('refuses a staff member of another restaurant and a token meant for another service', async () => {
    const restaurantId = '0199a5d0-0000-7000-8000-0000000000b7';
    await publishMembers(restaurantId, [staffAId]);
    await waitForMembers(restaurantId);

    const staffB = await rejectionOf(
      (await kitchenClientFor('staff-b')).listTickets({ restaurantId }),
    );
    const otherAudience = await rejectionOf(
      (await kitchenClientFor('staff-a', 'restaurant-service')).listTickets({ restaurantId }),
    );

    expect([staffB.code, staffB.findDetails(TicketCommandFailureSchema)[0]?.reason]).toEqual([
      Code.PermissionDenied,
      'NotRestaurantMember',
    ]);
    expect(otherAudience.code).toBe(Code.Unauthenticated);
  });

  it('answers its health endpoint', async () => {
    const response = await fetch(`${kitchenService.url}/health`);

    expect(response.status).toBe(200);
  });

  it('releases its database connections when it fails to start', async () => {
    const databaseName = 'kitchen_start_failure';
    const databaseUrl = await createDatabaseThatFailsMigrations(databaseName);

    const failedStart = startKitchenService(serviceConfiguration({ databaseUrl }));

    await expect(failedStart).rejects.toThrow();
    const openConnections = await waitFor(async () => {
      const count = await countConnectionsTo(databaseName);
      return count === 0 ? count : undefined;
    }, 5_000);
    expect(openConnections).toBe(0);
  });

  it('releases its database connections when its health port is taken', async () => {
    const databaseName = 'kitchen_port_taken';
    await sql`create database ${sql.id(databaseName)}`.execute(outboxReader);
    const databaseUrl = new URL(postgres.connectionUri);
    databaseUrl.pathname = `/${databaseName}`;

    const failedStart = startKitchenService(
      serviceConfiguration({
        databaseUrl: databaseUrl.toString(),
        port: Number(new URL(kitchenService.url).port),
      }),
    );

    await expect(failedStart).rejects.toThrow('EADDRINUSE');
    const openConnections = await waitFor(async () => {
      const count = await countConnectionsTo(databaseName);
      return count === 0 ? count : undefined;
    }, 5_000);
    expect(openConnections).toBe(0);
  });

  it('stops answering its health endpoint, running housekeeping and holding database connections once stopped', async () => {
    const databaseName = 'kitchen_stopped';
    await sql`create database ${sql.id(databaseName)}`.execute(outboxReader);
    const databaseUrl = new URL(postgres.connectionUri);
    databaseUrl.pathname = `/${databaseName}`;
    const stoppableService = await startKitchenService(
      serviceConfiguration({
        databaseUrl: databaseUrl.toString(),
        housekeepingIntervalInMilliseconds: 100,
      }),
    );
    const healthUrl = `${stoppableService.url}/health`;
    expect((await fetch(healthUrl)).status).toBe(200);
    await waitFor(() => Promise.resolve(spans.spansNamed('housekeeping').at(0)));

    await stoppableService.stop();
    const housekeepingRuns = spans.spansNamed('housekeeping');

    await expect(fetch(healthUrl)).rejects.toThrow('fetch failed');
    const openConnections = await waitFor(async () => {
      const count = await countConnectionsTo(databaseName);
      return count === 0 ? count : undefined;
    }, 5_000);
    expect(openConnections).toBe(0);
    await delay(500);
    expect(spans.spansNamed('housekeeping')).toHaveLength(housekeepingRuns.length);
    expect(housekeepingRuns.every((run) => run.parentSpanContext === undefined)).toBe(true);
    expect(housekeepingRuns.map((run) => run.status.code)).not.toContain(SpanStatusCode.ERROR);
  });
});
