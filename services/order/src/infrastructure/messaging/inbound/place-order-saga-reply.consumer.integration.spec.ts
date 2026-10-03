import { withInbox, type InboxSettings, type TransactionalMessageHandler } from '@fd/chassis-inbox';
import { PermanentMessageFailure, type MessageHandler } from '@fd/chassis-kafka';
import { createLogger } from '@fd/chassis-observability';
import { PaymentAuthorizedSchema } from '@fd/contracts/fooddelivery/accounting/v1/replies_pb.js';
import { ConsumerVerifiedSchema } from '@fd/contracts/fooddelivery/consumer/v1/replies_pb.js';
import {
  TicketApprovedSchema,
  TicketCreatedSchema,
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
  readonly messageType: string;
  readonly causationId: string | null;
  readonly correlationId: string;
}

const orderId = '0199a5d0-0000-7000-8000-0000000000a1';
const approvedAt = new Date('2026-10-02T12:00:30.000Z');

let testDatabase: OrderTestDatabase;
let handleReply: MessageHandler;
let consumeReply: TransactionalMessageHandler<OrderDatabase>;
let inboxSettings: InboxSettings<OrderDatabase>;
let messageCount = 0;

async function readOutbox(): Promise<readonly OutboxRow[]> {
  const result = await sql<OutboxRow>`
    select message_type, causation_id, correlation_id from outbox order by id
  `.execute(testDatabase.database);
  return result.rows;
}

async function countInboxRows(messageId: string): Promise<number> {
  const result = await sql`select 1 from inbox where message_id = ${messageId}`.execute(
    testDatabase.database,
  );
  return result.rows.length;
}

beforeAll(async () => {
  testDatabase = await startOrderTestDatabase();
});

beforeEach(async () => {
  await testDatabase.clearWrittenRows();
  const unitOfWork = createOrderUnitOfWork({
    database: testDatabase.database,
    generateMessageId: () => {
      messageCount += 1;
      return `0199a5d0-0000-7000-8000-${messageCount.toString(16).padStart(12, '0')}`;
    },
    now: () => approvedAt,
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
    now: () => approvedAt,
  };
  consumeReply = placeOrderSagaReplyConsumer({
    unitOfWork,
    clock: new FakeClock(approvedAt),
    logger: createLogger({ serviceName: 'order-service', level: 'silent' }),
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
    const orders = new PostgresOrderRepository(testDatabase.database);
    const order = await orders.findById(buildOrder().toSnapshot().orderId);
    expect(order?.toSnapshot().state).toEqual({ status: 'APPROVED', approvedAt });
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
