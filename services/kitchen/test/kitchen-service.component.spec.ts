import { setTimeout as delay } from 'node:timers/promises';
import {
  create,
  fromBinary,
  toBinary,
  type DescMessage,
  type MessageInitShape,
} from '@bufbuild/protobuf';
import { createKafka } from '@fd/chassis-kafka';
import { createDatabase } from '@fd/chassis-postgres';
import {
  startKafkaContainer,
  startPostgresContainer,
  type StartedKafka,
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
import { sql, type Kysely } from 'kysely';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { startKitchenService, type RunningKitchenService } from '../src/main.ts';

interface ReplyRow {
  readonly messageType: string;
  readonly sagaId: string | null;
  readonly payload: Uint8Array;
}

const commandsTopic = 'kitchen.commands';
const orderId = '0199a5d0-0000-7000-8000-0000000000a1';
const sagaId = '0199a5d0-0000-7000-8000-0000000000b1';
const waitLimitInMilliseconds = 30_000;

let postgres: StartedPostgres;
let kafka: StartedKafka;
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

async function createCommandTopics(): Promise<void> {
  const admin = createKafka({
    clientId: 'component-test',
    bootstrapServers: [kafka.bootstrapServer],
  }).admin();
  await admin.connect();
  await admin.createTopics({
    topics: [commandsTopic, `${commandsTopic}.kitchen-service.dlq`].map((topic) => ({
      topic,
      numPartitions: 1,
      replicationFactor: 1,
    })),
  });
  await admin.disconnect();
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
        },
      },
    ],
  });
  await producer.disconnect();
}

async function waitForReplyTo(messageId: string): Promise<ReplyRow> {
  return waitFor(async () => {
    const result = await sql<ReplyRow>`
      select message_type, saga_id, payload from outbox where causation_id = ${messageId}
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
  kitchenService = await startKitchenService({
    databaseUrl: postgres.connectionUri,
    kafkaBootstrapServers: [kafka.bootstrapServer],
    host: '127.0.0.1',
    port: 0,
    logLevel: 'silent',
  });
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
  });

  it('answers its health endpoint', async () => {
    const response = await fetch(`${kitchenService.url}/health`);

    expect(response.status).toBe(200);
  });

  it('releases its database connections when it fails to start', async () => {
    const databaseName = 'kitchen_start_failure';
    const databaseUrl = await createDatabaseThatFailsMigrations(databaseName);

    const failedStart = startKitchenService({
      databaseUrl,
      kafkaBootstrapServers: [kafka.bootstrapServer],
      host: '127.0.0.1',
      port: 0,
      logLevel: 'silent',
    });

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

    const failedStart = startKitchenService({
      databaseUrl: databaseUrl.toString(),
      kafkaBootstrapServers: [kafka.bootstrapServer],
      host: '127.0.0.1',
      port: Number(new URL(kitchenService.url).port),
      logLevel: 'silent',
    });

    await expect(failedStart).rejects.toThrow('EADDRINUSE');
    const openConnections = await waitFor(async () => {
      const count = await countConnectionsTo(databaseName);
      return count === 0 ? count : undefined;
    }, 5_000);
    expect(openConnections).toBe(0);
  });

  it('stops answering its health endpoint and releases its database connections once stopped', async () => {
    const databaseName = 'kitchen_stopped';
    await sql`create database ${sql.id(databaseName)}`.execute(outboxReader);
    const databaseUrl = new URL(postgres.connectionUri);
    databaseUrl.pathname = `/${databaseName}`;
    const stoppableService = await startKitchenService({
      databaseUrl: databaseUrl.toString(),
      kafkaBootstrapServers: [kafka.bootstrapServer],
      host: '127.0.0.1',
      port: 0,
      logLevel: 'silent',
    });
    const healthUrl = `${stoppableService.url}/health`;
    expect((await fetch(healthUrl)).status).toBe(200);

    await stoppableService.stop();

    await expect(fetch(healthUrl)).rejects.toThrow('fetch failed');
    const openConnections = await waitFor(async () => {
      const count = await countConnectionsTo(databaseName);
      return count === 0 ? count : undefined;
    }, 5_000);
    expect(openConnections).toBe(0);
  });
});
