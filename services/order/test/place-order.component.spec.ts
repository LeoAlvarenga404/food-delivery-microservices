import { setTimeout as delay } from 'node:timers/promises';
import { create, toBinary, type DescMessage, type MessageInitShape } from '@bufbuild/protobuf';
import { Code, createClient, type Client, type Interceptor } from '@connectrpc/connect';
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
import { PaymentAuthorizedSchema } from '@fd/contracts/fooddelivery/accounting/v1/replies_pb.js';
import { ConsumerVerifiedSchema } from '@fd/contracts/fooddelivery/consumer/v1/replies_pb.js';
import {
  TicketApprovedSchema,
  TicketCreatedSchema,
} from '@fd/contracts/fooddelivery/kitchen/v1/replies_pb.js';
import { OrderRejectionReason } from '@fd/contracts/fooddelivery/order/v1/events_pb.js';
import {
  OrderService,
  OrderStatus,
  PlaceOrderRequestSchema,
  type PlaceOrderRequest,
} from '@fd/contracts/fooddelivery/order/v1/service_pb.js';
import { sql, type Kysely } from 'kysely';
import { v7 as generateUuidV7 } from 'uuid';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { OrderServiceConfiguration } from '../src/infrastructure/order-service.config.ts';
import { startOrderService, type RunningOrderService } from '../src/main.ts';
import { guaranaId, margheritaId, pizzeriaMenu } from './support/order.builder.ts';
import { sagaTimeoutsInMilliseconds } from './support/place-order-saga.builder.ts';

interface CommandRow {
  readonly sagaId: string;
  readonly correlationId: string;
  readonly traceparent: string | null;
  readonly actorId: string | null;
  readonly actorType: string | null;
}

const repliesTopic = 'order.place-order-saga.replies';
const waitLimitInMilliseconds = 30_000;
const housekeepingIntervalInMilliseconds = 3_600_000;
const replyTraceId = '4bf92f3577b34da6a3ce929d0e0e4736';
const consumerAId = '0199a5d0-0000-7000-8000-0000000000c1';
const spans = recordSpans();
const componentSagaTimeoutsInMilliseconds = {
  ...sagaTimeoutsInMilliseconds,
  VERIFYING_CONSUMER: 5_000,
};

let postgres: StartedPostgres;
let kafka: StartedKafka;
let keycloak: StartedKeycloak;
let orderService: RunningOrderService;
let client: Client<typeof OrderService>;
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

async function waitForCommand(messageType: string): Promise<CommandRow> {
  return waitFor(async () => {
    const result = await sql<CommandRow>`
      select saga_id, correlation_id, traceparent, actor_id, actor_type
      from outbox where message_type = ${messageType}
    `.execute(outboxReader);
    return result.rows[0];
  });
}

async function createReplyTopics(): Promise<void> {
  const admin = createKafka({
    clientId: 'component-test',
    bootstrapServers: [kafka.bootstrapServer],
  }).admin();
  await admin.connect();
  await admin.createTopics({
    topics: [repliesTopic, `${repliesTopic}.order-service.dlq`].map((topic) => ({
      topic,
      numPartitions: 1,
      replicationFactor: 1,
    })),
  });
  await admin.disconnect();
}

async function reply<Schema extends DescMessage>(
  command: CommandRow,
  schema: Schema,
  payload: MessageInitShape<Schema>,
): Promise<void> {
  const producer = createKafka({
    clientId: 'participant-double',
    bootstrapServers: [kafka.bootstrapServer],
  }).producer();
  await producer.connect();
  await producer.send({
    topic: repliesTopic,
    messages: [
      {
        key: command.sagaId,
        value: Buffer.from(toBinary(schema, create(schema, payload))),
        headers: {
          'message-id': generateUuidV7(),
          'message-type': schema.typeName,
          'correlation-id': command.correlationId,
          'saga-id': command.sagaId,
          traceparent: `00-${replyTraceId}-00f067aa0ba902b7-01`,
        },
      },
    ],
  });
  await producer.disconnect();
}

function buildPlaceOrderRequest(idempotencyKey: string, paymentToken: string): PlaceOrderRequest {
  return create(PlaceOrderRequestSchema, {
    idempotencyKey,
    paymentToken,
    restaurantId: pizzeriaMenu.restaurantId,
    lineItems: [
      { menuItemId: margheritaId, quantity: 2 },
      { menuItemId: guaranaId, quantity: 1 },
    ],
    deliveryAddress: {
      street: 'Rua Augusta',
      number: '1500',
      city: 'Sao Paulo',
      postalCode: '01304-001',
    },
  });
}

async function countConnectionsTo(databaseName: string): Promise<number> {
  const result = await sql<{ readonly connectionCount: bigint }>`
    select count(*) as connection_count from pg_stat_activity where datname = ${databaseName}
  `.execute(outboxReader);
  return Number(result.rows[0]?.connectionCount);
}

function sendingAccessToken(accessToken: string): Interceptor {
  return (next) => (request) => {
    request.header.set('authorization', `Bearer ${accessToken}`);
    return next(request);
  };
}

function clientFor(accessToken: string | undefined): Client<typeof OrderService> {
  return createClient(
    OrderService,
    createConnectTransport({
      baseUrl: orderService.url,
      httpVersion: '1.1',
      interceptors: accessToken === undefined ? [] : [sendingAccessToken(accessToken)],
    }),
  );
}

async function orderServiceTokenOf(username: string): Promise<string> {
  const exchange = createTokenExchange({
    tokenUrl: keycloak.tokenUrl,
    clientId: 'consumer-bff',
    clientSecret: keycloak.consumerBffClientSecret,
  });
  const exchanged = await exchange(await keycloak.signIn(username), 'order-service');
  if (exchanged.isLeft()) throw new Error(`exchange refused: ${exchanged.failure.error}`);
  return exchanged.success;
}

function serviceConfiguration(
  overrides: Partial<OrderServiceConfiguration>,
): OrderServiceConfiguration {
  return {
    databaseUrl: postgres.connectionUri,
    kafkaBootstrapServers: [kafka.bootstrapServer],
    host: '127.0.0.1',
    port: 0,
    logLevel: 'silent',
    housekeepingIntervalInMilliseconds,
    sagaTimeoutsInMilliseconds,
    accessTokenIssuer: keycloak.issuer,
    accessTokenJwksUrl: keycloak.jwksUrl,
    ...overrides,
  };
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
  await createReplyTopics();
  orderService = await startOrderService(
    serviceConfiguration({ sagaTimeoutsInMilliseconds: componentSagaTimeoutsInMilliseconds }),
  );
  stoppers.push(() => orderService.stop());
  client = clientFor(await orderServiceTokenOf('consumer-a'));
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

describe('order service', () => {
  it('approves a placed order once every participant replied through Kafka', async () => {
    const { orderId } = await client.placeOrder(
      buildPlaceOrderRequest('checkout-component-test', 'tok_visa_4242'),
    );

    await reply(
      await waitForCommand('fooddelivery.consumer.v1.VerifyConsumer'),
      ConsumerVerifiedSchema,
      {
        orderId,
      },
    );
    await reply(await waitForCommand('fooddelivery.kitchen.v1.CreateTicket'), TicketCreatedSchema, {
      orderId,
      ticketId: 'ticket-1',
    });
    await reply(
      await waitForCommand('fooddelivery.accounting.v1.AuthorizePayment'),
      PaymentAuthorizedSchema,
      { orderId, paymentId: 'payment-1' },
    );
    await reply(
      await waitForCommand('fooddelivery.kitchen.v1.ApproveTicket'),
      TicketApprovedSchema,
      {
        orderId,
        ticketId: 'ticket-1',
      },
    );

    const approved = await waitFor(async () => {
      const order = await client.getOrder({ orderId });
      return order.status === OrderStatus.APPROVED ? order : undefined;
    });
    expect(approved.totalInCents).toBe(9800n);
    expect(await waitForCommand('fooddelivery.consumer.v1.VerifyConsumer')).toMatchObject({
      actorId: consumerAId,
      actorType: 'consumer',
    });
    const createTicket = await waitForCommand('fooddelivery.kitchen.v1.CreateTicket');
    expect(spans.spansNamed('process order.place-order-saga.replies').map(traceparentOf)).toContain(
      createTicket.traceparent,
    );
    expect(
      spans
        .spansNamed('process order.place-order-saga.replies')
        .map((span) => span.attributes['fooddelivery.order.id']),
    ).toContain(orderId);
  });

  it('answers a repeated placement with the same Idempotency-Key with the same order', async () => {
    const request = buildPlaceOrderRequest('checkout-replay-test', 'tok_visa_4242');
    const different = buildPlaceOrderRequest('checkout-replay-test', 'tok_mastercard_4444');

    const first = await client.placeOrder(request);
    const repeated = await client.placeOrder(request);

    expect(repeated.orderId).toBe(first.orderId);
    await expect(client.placeOrder(different)).rejects.toMatchObject({
      code: Code.FailedPrecondition,
    });
  });

  it('refuses a call without an access token as unauthenticated', async () => {
    await expect(
      clientFor(undefined).getOrder({ orderId: '0199a5d0-0000-7000-8000-0000000000ff' }),
    ).rejects.toMatchObject({ code: Code.Unauthenticated });
  });

  it('refuses a token issued for another audience as unauthenticated', async () => {
    const consumerBffToken = await keycloak.signIn('consumer-a');

    await expect(
      clientFor(consumerBffToken).placeOrder(
        buildPlaceOrderRequest('checkout-audience-test', 'tok_visa_4242'),
      ),
    ).rejects.toMatchObject({ code: Code.Unauthenticated });
  });

  it('refuses a caller without the consumer role as permission denied', async () => {
    const staffClient = clientFor(await orderServiceTokenOf('staff-a'));

    await expect(
      staffClient.placeOrder(buildPlaceOrderRequest('checkout-staff-test', 'tok_visa_4242')),
    ).rejects.toMatchObject({ code: Code.PermissionDenied });
  });

  it('answers the order of another consumer as not found', async () => {
    const { orderId } = await client.placeOrder(
      buildPlaceOrderRequest('checkout-ownership-test', 'tok_visa_4242'),
    );
    const consumerBClient = clientFor(await orderServiceTokenOf('consumer-b'));

    await expect(consumerBClient.getOrder({ orderId })).rejects.toMatchObject({
      code: Code.NotFound,
    });
  });

  it('keeps the same Idempotency-Key of two consumers apart', async () => {
    const request = buildPlaceOrderRequest('checkout-two-consumers-test', 'tok_visa_4242');
    const consumerBClient = clientFor(await orderServiceTokenOf('consumer-b'));

    const forConsumerA = await client.placeOrder(request);
    const forConsumerB = await consumerBClient.placeOrder(request);

    expect(forConsumerB.orderId).not.toBe(forConsumerA.orderId);
  });

  it('rejects an order whose consumer never answers once the verification step times out', async () => {
    const { orderId } = await client.placeOrder(
      buildPlaceOrderRequest('checkout-timeout-test', 'tok_visa_4242'),
    );

    const rejected = await waitFor(async () => {
      const order = await client.getOrder({ orderId });
      return order.status === OrderStatus.REJECTED ? order : undefined;
    });

    expect(rejected.rejectionReason).toBe(OrderRejectionReason.CONSUMER_VERIFICATION_TIMED_OUT);
    const timeout = spans
      .spansNamed('place order saga step timeout')
      .find((span) => span.attributes['fooddelivery.order.id'] === orderId);
    const sweep = spans
      .spansNamed('place order saga deadlines')
      .find((span) => span.spanContext().spanId === timeout?.parentSpanContext?.spanId);
    expect(sweep).toBeDefined();
    expect(sweep?.parentSpanContext).toBeUndefined();
  });

  it('answers its health endpoint', async () => {
    const response = await fetch(`${orderService.url}/health`);

    expect(response.status).toBe(200);
  });

  it('releases its database connections when it fails to start', async () => {
    const databaseName = 'order_start_failure';
    await sql`create database order_start_failure`.execute(outboxReader);
    const databaseUrl = new URL(postgres.connectionUri);
    databaseUrl.pathname = `/${databaseName}`;

    const failedStart = startOrderService(
      serviceConfiguration({
        databaseUrl: databaseUrl.toString(),
        port: Number(new URL(orderService.url).port),
      }),
    );

    await expect(failedStart).rejects.toThrow();
    const openConnections = await waitFor(async () => {
      const count = await countConnectionsTo(databaseName);
      return count === 0 ? count : undefined;
    }, 5_000);
    expect(openConnections).toBe(0);
  });

  it('runs housekeeping in root spans and stops its periodic jobs when it stops', async () => {
    await sql`create database order_stopped`.execute(outboxReader);
    const databaseUrl = new URL(postgres.connectionUri);
    databaseUrl.pathname = '/order_stopped';
    const stoppableService = await startOrderService(
      serviceConfiguration({
        databaseUrl: databaseUrl.toString(),
        housekeepingIntervalInMilliseconds: 100,
      }),
    );
    await waitFor(() => Promise.resolve(spans.spansNamed('housekeeping').at(0)));

    await stoppableService.stop();
    const housekeepingRuns = spans.spansNamed('housekeeping');
    await delay(1_500);

    expect(spans.spansNamed('housekeeping')).toHaveLength(housekeepingRuns.length);
    expect(housekeepingRuns.every((run) => run.parentSpanContext === undefined)).toBe(true);
    expect(housekeepingRuns.map((run) => run.status.code)).not.toContain(SpanStatusCode.ERROR);
    const deadlineSweeps = spans.spansNamed('place order saga deadlines');
    expect(deadlineSweeps.map((sweep) => sweep.status.code)).not.toContain(SpanStatusCode.ERROR);
  });
});
