import { setTimeout as delay } from 'node:timers/promises';
import { create, toBinary } from '@bufbuild/protobuf';
import { createKafka } from '@fd/chassis-kafka';
import { createDatabase } from '@fd/chassis-postgres';
import {
  recordSpans,
  SpanStatusCode,
  startKafkaContainer,
  startPostgresContainer,
  traceparentOf,
  type StartedKafka,
  type StartedPostgres,
} from '@fd/chassis-testing';
import { AuthorizePaymentSchema } from '@fd/contracts/fooddelivery/accounting/v1/commands_pb.js';
import { sql, type Kysely } from 'kysely';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { startAccountingService, type RunningAccountingService } from '../src/main.ts';

interface ReplyRow {
  readonly messageType: string;
  readonly sagaId: string | null;
  readonly traceparent: string | null;
}

const commandsTopic = 'accounting.commands';
const sagaId = '0199a5d0-0000-7000-8000-0000000000b1';
const commandMessageId = '0199a5d0-0000-7000-8000-000000000d03';
const waitLimitInMilliseconds = 30_000;
const housekeepingIntervalInMilliseconds = 3_600_000;
const commandTraceId = '4bf92f3577b34da6a3ce929d0e0e4736';
const spans = recordSpans();

let postgres: StartedPostgres;
let kafka: StartedKafka;
let accountingService: RunningAccountingService;
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
    topics: [commandsTopic, `${commandsTopic}.accounting-service.dlq`].map((topic) => ({
      topic,
      numPartitions: 1,
      replicationFactor: 1,
    })),
  });
  await admin.disconnect();
}

async function sendAuthorizePayment(): Promise<void> {
  const producer = createKafka({
    clientId: 'order-double',
    bootstrapServers: [kafka.bootstrapServer],
  }).producer();
  await producer.connect();
  const authorizePayment = create(AuthorizePaymentSchema, {
    orderId: '0199a5d0-0000-7000-8000-0000000000a1',
    consumerId: '0199a5d0-0000-7000-8000-0000000000c1',
    restaurantId: '0199a5d0-0000-7000-8000-000000000001',
    amountInCents: 9800n,
    deliveryFeeInCents: 800n,
    currency: 'BRL',
    paymentToken: 'tok_visa_4242',
  });
  await producer.send({
    topic: commandsTopic,
    messages: [
      {
        key: authorizePayment.orderId,
        value: Buffer.from(toBinary(AuthorizePaymentSchema, authorizePayment)),
        headers: {
          'message-id': commandMessageId,
          'message-type': AuthorizePaymentSchema.typeName,
          'correlation-id': '0199a5d0-0000-7000-8000-0000000000e1',
          'saga-id': sagaId,
          traceparent: `00-${commandTraceId}-00f067aa0ba902b7-01`,
        },
      },
    ],
  });
  await producer.disconnect();
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
  await sql`create table payments (payment_id integer)`.execute(conflicting);
  await conflicting.destroy();
  return databaseUrl.toString();
}

beforeAll(async () => {
  [postgres, kafka] = await Promise.all([
    startPostgresContainer().then((started) => {
      stoppers.push(() => started.stop());
      return started;
    }),
    startKafkaContainer().then((started) => {
      stoppers.push(() => started.stop());
      return started;
    }),
  ]);
  await createCommandTopics();
  accountingService = await startAccountingService({
    databaseUrl: postgres.connectionUri,
    kafkaBootstrapServers: [kafka.bootstrapServer],
    slowGatewayResponseInMilliseconds: 0,
    host: '127.0.0.1',
    port: 0,
    logLevel: 'silent',
    housekeepingIntervalInMilliseconds,
  });
  stoppers.push(() => accountingService.stop());
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

describe('accounting service', () => {
  it('answers an AuthorizePayment command from Kafka with a PaymentAuthorized reply in its outbox', async () => {
    await sendAuthorizePayment();

    const reply = await waitFor(async () => {
      const result = await sql<ReplyRow>`
        select message_type, saga_id, traceparent from outbox where causation_id = ${commandMessageId}
      `.execute(outboxReader);
      return result.rows[0];
    });

    const handled = await waitFor(() =>
      Promise.resolve(spans.spansNamed('process accounting.commands').at(0)),
    );
    expect(reply).toEqual({
      messageType: 'fooddelivery.accounting.v1.PaymentAuthorized',
      sagaId,
      traceparent: traceparentOf(handled),
    });
    expect(handled.spanContext().traceId).toBe(commandTraceId);
    expect(handled.attributes).toMatchObject({
      'fooddelivery.order.id': '0199a5d0-0000-7000-8000-0000000000a1',
    });
  });

  it('answers its health endpoint', async () => {
    const response = await fetch(`${accountingService.url}/health`);

    expect(response.status).toBe(200);
  });

  it('releases its database connections when it fails to start', async () => {
    const databaseName = 'accounting_start_failure';
    const databaseUrl = await createDatabaseThatFailsMigrations(databaseName);

    const failedStart = startAccountingService({
      databaseUrl,
      kafkaBootstrapServers: [kafka.bootstrapServer],
      slowGatewayResponseInMilliseconds: 0,
      host: '127.0.0.1',
      port: 0,
      logLevel: 'silent',
      housekeepingIntervalInMilliseconds,
    });

    await expect(failedStart).rejects.toThrow();
    const openConnections = await waitFor(async () => {
      const count = await countConnectionsTo(databaseName);
      return count === 0 ? count : undefined;
    }, 5_000);
    expect(openConnections).toBe(0);
  });

  it('releases its database connections when its health port is taken', async () => {
    const databaseName = 'accounting_port_taken';
    await sql`create database ${sql.id(databaseName)}`.execute(outboxReader);
    const databaseUrl = new URL(postgres.connectionUri);
    databaseUrl.pathname = `/${databaseName}`;

    const failedStart = startAccountingService({
      databaseUrl: databaseUrl.toString(),
      kafkaBootstrapServers: [kafka.bootstrapServer],
      slowGatewayResponseInMilliseconds: 0,
      host: '127.0.0.1',
      port: Number(new URL(accountingService.url).port),
      logLevel: 'silent',
      housekeepingIntervalInMilliseconds,
    });

    await expect(failedStart).rejects.toThrow('EADDRINUSE');
    const openConnections = await waitFor(async () => {
      const count = await countConnectionsTo(databaseName);
      return count === 0 ? count : undefined;
    }, 5_000);
    expect(openConnections).toBe(0);
  });

  it('stops answering its health endpoint, running housekeeping and holding database connections once stopped', async () => {
    const databaseName = 'accounting_stopped';
    await sql`create database ${sql.id(databaseName)}`.execute(outboxReader);
    const databaseUrl = new URL(postgres.connectionUri);
    databaseUrl.pathname = `/${databaseName}`;
    const stoppableService = await startAccountingService({
      databaseUrl: databaseUrl.toString(),
      kafkaBootstrapServers: [kafka.bootstrapServer],
      slowGatewayResponseInMilliseconds: 0,
      host: '127.0.0.1',
      port: 0,
      logLevel: 'silent',
      housekeepingIntervalInMilliseconds: 100,
    });
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
