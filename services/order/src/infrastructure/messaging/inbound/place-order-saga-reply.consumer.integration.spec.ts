import { Writable } from 'node:stream';
import { withInbox, type InboxSettings, type TransactionalMessageHandler } from '@fd/chassis-inbox';
import { PermanentMessageFailure, type MessageHandler } from '@fd/chassis-kafka';
import { createLogger, type Logger } from '@fd/chassis-observability';
import {
  PaymentAuthorizedSchema,
  PaymentFailedSchema,
  PaymentFailureReason,
} from '@fd/contracts/fooddelivery/accounting/v1/replies_pb.js';
import {
  ConsumerVerificationFailedSchema,
  ConsumerVerificationFailureReason,
  ConsumerVerifiedSchema,
} from '@fd/contracts/fooddelivery/consumer/v1/replies_pb.js';
import {
  TicketApprovedSchema,
  TicketCreatedSchema,
  TicketRejectedSchema,
} from '@fd/contracts/fooddelivery/kitchen/v1/replies_pb.js';
import { sql } from 'kysely';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { FakeClock } from '../../../../test/support/clock.fake.ts';
import { FakeIdGenerator } from '../../../../test/support/id-generator.fake.ts';
import {
  startOrderTestDatabase,
  type OrderTestDatabase,
} from '../../../../test/support/order-database.builder.ts';
import { buildOrder, unwrap } from '../../../../test/support/order.builder.ts';
import { buildPlaceOrderCommand } from '../../../../test/support/place-order-command.builder.ts';
import { buildReplyMessage } from '../../../../test/support/reply-message.builder.ts';
import type { DB as OrderDatabase } from '#infrastructure/persistence/generated/database.ts';
import { PlaceOrderCommandHandler } from '#application/commands/place-order/place-order.command-handler.ts';
import { createOrderUnitOfWork } from '#infrastructure/persistence/order-unit-of-work.adapter.ts';
import { PostgresOrderRepository } from '#infrastructure/persistence/postgres-order.repository.ts';
import { placeOrderSagaReplyConsumer } from './place-order-saga-reply.consumer.ts';

interface OutboxRow {
  readonly topic: string;
  readonly messageType: string;
  readonly causationId: string | null;
  readonly correlationId: string;
}

const orderId = '0199a5d0-0000-7000-8000-0000000000a1';
const repliedAt = new Date('2026-10-02T12:00:30.000Z');

let testDatabase: OrderTestDatabase;
let handleReply: MessageHandler;
let consumeReply: TransactionalMessageHandler<OrderDatabase>;
let inboxSettings: InboxSettings<OrderDatabase>;
let logEntries: Record<string, unknown>[];
let messageCount = 0;

function captureLogger(): Logger {
  const destination = new Writable({
    write(chunk: Buffer, encoding, callback) {
      const parsed: unknown = JSON.parse(chunk.toString());
      logEntries.push(typeof parsed === 'object' && parsed !== null ? { ...parsed } : {});
      callback();
    },
  });
  return createLogger({ serviceName: 'order-service', level: 'info' }, destination);
}

async function readOutbox(): Promise<readonly OutboxRow[]> {
  const result = await sql<OutboxRow>`
    select topic, message_type, causation_id, correlation_id from outbox order by id
  `.execute(testDatabase.database);
  return result.rows;
}

async function countInboxRows(messageId: string): Promise<number> {
  const result = await sql`select 1 from inbox where message_id = ${messageId}`.execute(
    testDatabase.database,
  );
  return result.rows.length;
}

async function readSagaStatus(): Promise<string> {
  const row = await testDatabase.database
    .selectFrom('sagaInstances')
    .select('status')
    .executeTakeFirstOrThrow();
  return row.status;
}

async function readOrderState() {
  const order = await new PostgresOrderRepository(testDatabase.database).findById(
    buildOrder().toSnapshot().orderId,
  );
  return order?.toSnapshot().state;
}

beforeAll(async () => {
  testDatabase = await startOrderTestDatabase();
});

beforeEach(async () => {
  await testDatabase.clearWrittenRows();
  logEntries = [];
  const unitOfWork = createOrderUnitOfWork({
    database: testDatabase.database,
    generateMessageId: () => {
      messageCount += 1;
      return `0199a5d0-0000-7000-8000-${messageCount.toString(16).padStart(12, '0')}`;
    },
    now: () => repliedAt,
  });
  const placeOrder = new PlaceOrderCommandHandler(
    unitOfWork,
    new FakeClock(),
    new FakeIdGenerator(),
  );
  unwrap(await placeOrder.execute(buildPlaceOrderCommand()));
  inboxSettings = {
    database: testDatabase.database,
    handlerName: 'place-order-saga-reply',
    now: () => repliedAt,
  };
  consumeReply = placeOrderSagaReplyConsumer({
    unitOfWork,
    clock: new FakeClock(repliedAt),
    logger: captureLogger(),
  });
  handleReply = withInbox(inboxSettings, consumeReply);
});

afterAll(async () => {
  await testDatabase.stop();
});

describe('placeOrderSagaReplyConsumer', () => {
  it('drives the saga to an approved order and chains each command to the reply that caused it', async () => {
    const consumerVerified = buildReplyMessage(ConsumerVerifiedSchema, { orderId });

    await handleReply(consumerVerified);
    await handleReply(buildReplyMessage(TicketCreatedSchema, { orderId, ticketId: 'ticket-1' }));
    await handleReply(buildReplyMessage(PaymentAuthorizedSchema, { orderId, paymentId: 'pay-1' }));
    await handleReply(buildReplyMessage(TicketApprovedSchema, { orderId, ticketId: 'ticket-1' }));

    const outbox = await readOutbox();
    expect(outbox.map((row) => row.messageType)).toEqual([
      'fooddelivery.order.v1.OrderPlaced',
      'fooddelivery.consumer.v1.VerifyConsumer',
      'fooddelivery.kitchen.v1.CreateTicket',
      'fooddelivery.accounting.v1.AuthorizePayment',
      'fooddelivery.kitchen.v1.ApproveTicket',
      'fooddelivery.order.v1.OrderApproved',
    ]);
    expect(outbox[2]?.causationId).toBe(consumerVerified.headers.messageId);
    expect(outbox.slice(2).map((row) => row.correlationId)).toEqual(
      Array.from({ length: 4 }, () => consumerVerified.headers.correlationId),
    );
    expect(await readOrderState()).toEqual({ status: 'APPROVED', approvedAt: repliedAt });
  });

  it('compensates a declined payment: rejects the ticket first, then the order', async () => {
    await handleReply(buildReplyMessage(ConsumerVerifiedSchema, { orderId }));
    await handleReply(buildReplyMessage(TicketCreatedSchema, { orderId, ticketId: 'ticket-1' }));
    const paymentFailed = buildReplyMessage(PaymentFailedSchema, {
      orderId,
      reason: PaymentFailureReason.PAYMENT_DECLINED,
    });

    await handleReply(paymentFailed);

    expect((await readOutbox()).at(-1)).toMatchObject({
      topic: 'kitchen.commands',
      messageType: 'fooddelivery.kitchen.v1.RejectTicket',
      causationId: paymentFailed.headers.messageId,
    });
    expect(await readOrderState()).toEqual({ status: 'APPROVAL_PENDING' });

    await handleReply(buildReplyMessage(TicketRejectedSchema, { orderId }));

    expect((await readOutbox()).at(-1)).toMatchObject({
      topic: 'order.order.events',
      messageType: 'fooddelivery.order.v1.OrderRejected',
    });
    expect(await readOrderState()).toEqual({
      status: 'REJECTED',
      rejectionReason: 'PAYMENT_DECLINED',
      rejectedAt: repliedAt,
    });
    expect(await readSagaStatus()).toBe('COMPENSATED');
  });

  it('rejects the order at once when the consumer cannot be verified', async () => {
    await handleReply(
      buildReplyMessage(ConsumerVerificationFailedSchema, {
        orderId,
        reason: ConsumerVerificationFailureReason.CONSUMER_NOT_FOUND,
      }),
    );

    expect((await readOutbox()).map((row) => row.messageType)).toEqual([
      'fooddelivery.order.v1.OrderPlaced',
      'fooddelivery.consumer.v1.VerifyConsumer',
      'fooddelivery.order.v1.OrderRejected',
    ]);
    expect(await readOrderState()).toEqual({
      status: 'REJECTED',
      rejectionReason: 'CONSUMER_NOT_FOUND',
      rejectedAt: repliedAt,
    });
    expect(await readSagaStatus()).toBe('COMPENSATED');
  });

  it('logs every applied reply with the order id it names', async () => {
    const consumerVerified = buildReplyMessage(ConsumerVerifiedSchema, { orderId });

    await handleReply(consumerVerified);

    expect(logEntries).toContainEqual(
      expect.objectContaining({
        msg: 'place order saga reply applied',
        orderId,
        sagaId: consumerVerified.headers.sagaId,
        messageId: consumerVerified.headers.messageId,
        reply: { type: 'ConsumerVerified' },
      }),
    );
  });

  it('applies a redelivered reply only once', async () => {
    const consumerVerified = buildReplyMessage(ConsumerVerifiedSchema, { orderId });

    let handlerCallCount = 0;
    const countingHandleReply = withInbox(inboxSettings, async (message, transaction) => {
      handlerCallCount += 1;
      await consumeReply(message, transaction);
    });

    await countingHandleReply(consumerVerified);
    await countingHandleReply(consumerVerified);

    const commandTypes = (await readOutbox()).map((row) => row.messageType);
    expect(commandTypes.filter((type) => type.endsWith('CreateTicket'))).toHaveLength(1);
    expect(handlerCallCount).toBe(1);
    expect(await countInboxRows(consumerVerified.headers.messageId)).toBe(1);
  });

  it('rolls back the saga step, its command and the inbox row when the inbox transaction fails', async () => {
    const consumerVerified = buildReplyMessage(ConsumerVerifiedSchema, { orderId });
    const failingHandleReply = withInbox(inboxSettings, async (message, transaction) => {
      await consumeReply(message, transaction);
      throw new Error('inbox transaction failed');
    });

    await expect(failingHandleReply(consumerVerified)).rejects.toThrow('inbox transaction failed');

    expect(await readOutbox()).toHaveLength(2);
    expect(await countInboxRows(consumerVerified.headers.messageId)).toBe(0);
  });

  it('acknowledges a reply the saga is not waiting for without changing anything', async () => {
    await handleReply(buildReplyMessage(PaymentAuthorizedSchema, { orderId, paymentId: 'pay-1' }));

    expect(await readOutbox()).toHaveLength(2);
  });

  it('dead-letters a reply for a saga that does not exist', async () => {
    const orphan = buildReplyMessage(
      ConsumerVerifiedSchema,
      { orderId },
      { sagaId: '0199a5d0-0000-7000-8000-0000000000bf' },
    );

    await expect(handleReply(orphan)).rejects.toThrow(PermanentMessageFailure);
  });

  it('dead-letters a reply without a saga id', async () => {
    const withoutSagaId = buildReplyMessage(ConsumerVerifiedSchema, { orderId });

    await expect(
      handleReply({ ...withoutSagaId, headers: { ...withoutSagaId.headers, sagaId: undefined } }),
    ).rejects.toThrow(PermanentMessageFailure);
  });
});
