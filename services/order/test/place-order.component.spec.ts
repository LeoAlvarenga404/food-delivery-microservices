import { setTimeout as delay } from 'node:timers/promises';
import { create, toBinary, type DescMessage, type MessageInitShape } from '@bufbuild/protobuf';
import { createClient, type Client } from '@connectrpc/connect';
import { createConnectTransport } from '@connectrpc/connect-node';
import { createKafka } from '@fd/chassis-kafka';
import { createDatabase } from '@fd/chassis-postgres';
import {
  startKafkaContainer,
  startPostgresContainer,
  type StartedKafka,
  type StartedPostgres,
} from '@fd/chassis-testing';
import { PaymentAuthorizedSchema } from '@fd/contracts/fooddelivery/accounting/v1/replies_pb.js';
import { ConsumerVerifiedSchema } from '@fd/contracts/fooddelivery/consumer/v1/replies_pb.js';
import {
  TicketApprovedSchema,
  TicketCreatedSchema,
} from '@fd/contracts/fooddelivery/kitchen/v1/replies_pb.js';
import {
  OrderService,
  OrderStatus,
  PlaceOrderRequestSchema,
} from '@fd/contracts/fooddelivery/order/v1/service_pb.js';
import { sql, type Kysely } from 'kysely';
import { v7 as generateUuidV7 } from 'uuid';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { startOrderService, type RunningOrderService } from '../src/main.ts';
import { guaranaId, margheritaId, pizzeriaMenu } from './support/order.builder.ts';

interface CommandRow {
  readonly sagaId: string;
  readonly correlationId: string;
}

const repliesTopic = 'order.place-order-saga.replies';
const waitLimitInMilliseconds = 30_000;

let postgres: StartedPostgres;
let kafka: StartedKafka;
let orderService: RunningOrderService;
let client: Client<typeof OrderService>;
let outboxReader: Kysely<unknown>;

async function waitFor<Result>(probe: () => Promise<Result | undefined>): Promise<Result> {
  const deadline = Date.now() + waitLimitInMilliseconds;
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
      select saga_id, correlation_id from outbox where message_type = ${messageType}
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
        },
      },
    ],
  });
  await producer.disconnect();
}

const placeOrderRequest = create(PlaceOrderRequestSchema, {
  idempotencyKey: 'checkout-component-test',
  consumerId: '0199a5d0-0000-7000-8000-0000000000c1',
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
  paymentToken: 'tok_visa_4242',
});

beforeAll(async () => {
  [postgres, kafka] = await Promise.all([startPostgresContainer(), startKafkaContainer()]);
  await createReplyTopics();
  orderService = await startOrderService({
    databaseUrl: postgres.connectionUri,
    kafkaBootstrapServers: [kafka.bootstrapServer],
    host: '127.0.0.1',
    port: 0,
    logLevel: 'silent',
  });
  client = createClient(
    OrderService,
    createConnectTransport({ baseUrl: orderService.url, httpVersion: '1.1' }),
  );
  outboxReader = createDatabase({
    connectionString: postgres.connectionUri,
    maximumConnectionCount: 1,
    onConnectionError: () => undefined,
  });
});

afterAll(async () => {
  await outboxReader.destroy();
  await orderService.stop();
  await Promise.all([kafka.stop(), postgres.stop()]);
});

describe('order service', () => {
  it('approves a placed order once every participant replied through Kafka', async () => {
    const { orderId } = await client.placeOrder(placeOrderRequest);

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
  });

  it('answers a repeated placement with the same Idempotency-Key with the same order', async () => {
    const first = await client.placeOrder(placeOrderRequest);
    const repeated = await client.placeOrder(placeOrderRequest);

    expect(repeated.orderId).toBe(first.orderId);
  });
});
