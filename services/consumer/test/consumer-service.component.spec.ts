import { setTimeout as delay } from 'node:timers/promises';
import { create, toBinary } from '@bufbuild/protobuf';
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
import { VerifyConsumerSchema } from '@fd/contracts/fooddelivery/consumer/v1/commands_pb.js';
import {
  ConsumerService,
  ConsumerStatus,
} from '@fd/contracts/fooddelivery/consumer/v1/service_pb.js';
import { sql, type Kysely } from 'kysely';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { ConsumerServiceConfiguration } from '../src/infrastructure/consumer-service.config.ts';
import { startConsumerService, type RunningConsumerService } from '../src/main.ts';

interface ReplyRow {
  readonly messageType: string;
  readonly sagaId: string | null;
  readonly traceparent: string | null;
}

const commandsTopic = 'consumer.commands';
const sagaId = '0199a5d0-0000-7000-8000-0000000000b1';
const commandMessageId = '0199a5d0-0000-7000-8000-000000000d01';
const consumerAId = '0199a5d0-0000-7000-8000-0000000000c1';
const consumerBId = '0199a5d0-0000-7000-8000-0000000000c2';
const waitLimitInMilliseconds = 30_000;
const housekeepingIntervalInMilliseconds = 3_600_000;
const commandTraceId = '4bf92f3577b34da6a3ce929d0e0e4736';
const homeAddress = {
  street: 'Rua Augusta',
  number: '1500',
  city: 'Sao Paulo',
  postalCode: '01304-001',
};
const spans = recordSpans();

let postgres: StartedPostgres;
let kafka: StartedKafka;
let keycloak: StartedKeycloak;
let consumerService: RunningConsumerService;
let consumerAClient: Client<typeof ConsumerService>;
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

async function createCommandTopics(): Promise<void> {
  const admin = createKafka({
    clientId: 'component-test',
    bootstrapServers: [kafka.bootstrapServer],
  }).admin();
  await admin.connect();
  await admin.createTopics({
    topics: [commandsTopic, `${commandsTopic}.consumer-service.dlq`].map((topic) => ({
      topic,
      numPartitions: 1,
      replicationFactor: 1,
    })),
  });
  await admin.disconnect();
}

async function sendVerifyConsumer(): Promise<void> {
  const producer = createKafka({
    clientId: 'order-double',
    bootstrapServers: [kafka.bootstrapServer],
  }).producer();
  await producer.connect();
  const verifyConsumer = create(VerifyConsumerSchema, {
    consumerId: consumerAId,
    orderId: '0199a5d0-0000-7000-8000-0000000000a1',
  });
  await producer.send({
    topic: commandsTopic,
    messages: [
      {
        key: verifyConsumer.orderId,
        value: Buffer.from(toBinary(VerifyConsumerSchema, verifyConsumer)),
        headers: {
          'message-id': commandMessageId,
          'message-type': VerifyConsumerSchema.typeName,
          'correlation-id': '0199a5d0-0000-7000-8000-0000000000e1',
          'saga-id': sagaId,
          traceparent: `00-${commandTraceId}-00f067aa0ba902b7-01`,
        },
      },
    ],
  });
  await producer.disconnect();
}

function sendingAccessToken(accessToken: string): Interceptor {
  return (next) => (request) => {
    request.header.set('authorization', `Bearer ${accessToken}`);
    return next(request);
  };
}

function clientFor(accessToken: string): Client<typeof ConsumerService> {
  return createClient(
    ConsumerService,
    createConnectTransport({
      baseUrl: consumerService.url,
      httpVersion: '1.1',
      interceptors: [sendingAccessToken(accessToken)],
    }),
  );
}

async function consumerServiceTokenOf(username: string): Promise<string> {
  const exchange = createTokenExchange({
    tokenUrl: keycloak.tokenUrl,
    clientId: 'consumer-bff',
    clientSecret: keycloak.consumerBffClientSecret,
  });
  const exchanged = await exchange(await keycloak.signIn(username), 'consumer-service');
  if (exchanged.isLeft()) throw new Error(`exchange refused: ${exchanged.failure.error}`);
  return exchanged.success;
}

function serviceConfiguration(
  overrides: Partial<ConsumerServiceConfiguration> = {},
): ConsumerServiceConfiguration {
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

async function countConnectionsTo(databaseName: string): Promise<number> {
  const result = await sql<{ readonly connectionCount: bigint }>`
    select count(*) as connection_count from pg_stat_activity where datname = ${databaseName}
  `.execute(outboxReader);
  return Number(result.rows[0]?.connectionCount);
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
  await sql`create table consumers (consumer_id integer)`.execute(conflicting);
  await conflicting.destroy();
  return databaseUrl;
}

async function waitUntilNoConnectionTo(databaseName: string): Promise<number> {
  return waitFor(async () => {
    const count = await countConnectionsTo(databaseName);
    return count === 0 ? count : undefined;
  }, 5_000);
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
  [postgres, kafka, keycloak] = await Promise.all([
    started(startPostgresContainer()),
    started(startKafkaContainer()),
    started(startKeycloakContainer()),
  ]);
  await createCommandTopics();
  consumerService = await started(startConsumerService(serviceConfiguration()));
  outboxReader = createDatabase({
    connectionString: postgres.connectionUri,
    maximumConnectionCount: 1,
    onConnectionError: () => undefined,
  });
  stoppers.push(() => outboxReader.destroy());
  consumerAClient = clientFor(await consumerServiceTokenOf('consumer-a'));
  await consumerAClient.registerConsumer({
    name: 'Ana Souza',
    email: 'ana.souza@food-delivery.test',
    addresses: [homeAddress],
  });
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

describe('consumer service', () => {
  it('registers the caller of a consumer service token and answers its profile', async () => {
    const consumerBClient = clientFor(await consumerServiceTokenOf('consumer-b'));

    const registered = await consumerBClient.registerConsumer({
      name: 'Bruno Lima',
      email: 'Bruno.Lima@food-delivery.test',
      addresses: [homeAddress],
    });

    expect(registered.consumerId).toBe(consumerBId);
    expect(await consumerBClient.getConsumer({})).toMatchObject({
      consumerId: consumerBId,
      name: 'Bruno Lima',
      email: 'bruno.lima@food-delivery.test',
      addresses: [homeAddress],
      status: ConsumerStatus.ACTIVE,
    });
  });

  it('refuses a second registration of the same caller as already existing', async () => {
    await expect(
      consumerAClient.registerConsumer({
        name: 'Another Name',
        email: 'another@food-delivery.test',
        addresses: [homeAddress],
      }),
    ).rejects.toMatchObject({ code: Code.AlreadyExists });
    expect(await consumerAClient.getConsumer({})).toMatchObject({ name: 'Ana Souza' });
  });

  it('refuses a token issued for another audience as unauthenticated', async () => {
    const consumerBffToken = await keycloak.signIn('consumer-a');

    await expect(clientFor(consumerBffToken).getConsumer({})).rejects.toMatchObject({
      code: Code.Unauthenticated,
    });
  });

  it('answers a VerifyConsumer command for a registered consumer with a ConsumerVerified reply in its outbox', async () => {
    await sendVerifyConsumer();

    const reply = await waitFor(async () => {
      const result = await sql<ReplyRow>`
        select message_type, saga_id, traceparent from outbox where causation_id = ${commandMessageId}
      `.execute(outboxReader);
      return result.rows[0];
    });

    const handled = await waitFor(() =>
      Promise.resolve(spans.spansNamed('process consumer.commands').at(0)),
    );
    expect(reply).toEqual({
      messageType: 'fooddelivery.consumer.v1.ConsumerVerified',
      sagaId,
      traceparent: traceparentOf(handled),
    });
    expect(handled.spanContext().traceId).toBe(commandTraceId);
    expect(handled.attributes).toMatchObject({
      'fooddelivery.order.id': '0199a5d0-0000-7000-8000-0000000000a1',
    });
  });

  it('answers its health endpoint', async () => {
    const response = await fetch(`${consumerService.url}/health`);

    expect(response.status).toBe(200);
  });

  it('releases its database connections when it fails to start', async () => {
    const databaseName = 'consumer_start_failure';
    const databaseUrl = await createDatabaseThatFailsMigrations(databaseName);

    const failedStart = startConsumerService(serviceConfiguration({ databaseUrl }));

    await expect(failedStart).rejects.toThrow();
    expect(await waitUntilNoConnectionTo(databaseName)).toBe(0);
  });

  it('releases its database connections when its port is taken', async () => {
    const databaseName = 'consumer_port_taken';
    const databaseUrl = await createEmptyDatabase(databaseName);

    const failedStart = startConsumerService(
      serviceConfiguration({ databaseUrl, port: Number(new URL(consumerService.url).port) }),
    );

    await expect(failedStart).rejects.toThrow('EADDRINUSE');
    expect(await waitUntilNoConnectionTo(databaseName)).toBe(0);
  });

  it('stops answering its health endpoint, running housekeeping and holding database connections once stopped', async () => {
    const databaseName = 'consumer_stopped';
    const databaseUrl = await createEmptyDatabase(databaseName);
    const stoppableService = await startConsumerService(
      serviceConfiguration({ databaseUrl, housekeepingIntervalInMilliseconds: 100 }),
    );
    const healthUrl = `${stoppableService.url}/health`;
    expect((await fetch(healthUrl)).status).toBe(200);
    await waitFor(() => Promise.resolve(spans.spansNamed('housekeeping').at(0)));

    await stoppableService.stop();
    const housekeepingRuns = spans.spansNamed('housekeeping');

    await expect(fetch(healthUrl)).rejects.toThrow('fetch failed');
    expect(await waitUntilNoConnectionTo(databaseName)).toBe(0);
    await delay(500);
    expect(spans.spansNamed('housekeeping')).toHaveLength(housekeepingRuns.length);
    expect(housekeepingRuns.every((run) => run.parentSpanContext === undefined)).toBe(true);
    expect(housekeepingRuns.map((run) => run.status.code)).not.toContain(SpanStatusCode.ERROR);
  });
});
