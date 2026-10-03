import { fromBinary } from '@bufbuild/protobuf';
import { withInbox, type InboxSettings, type TransactionalMessageHandler } from '@fd/chassis-inbox';
import { PermanentMessageFailure, type MessageHandler } from '@fd/chassis-kafka';
import { createLogger } from '@fd/chassis-observability';
import {
  ApproveTicketSchema,
  CreateTicketSchema,
} from '@fd/contracts/fooddelivery/kitchen/v1/commands_pb.js';
import {
  TicketApprovedSchema,
  TicketCreatedSchema,
} from '@fd/contracts/fooddelivery/kitchen/v1/replies_pb.js';
import { sql } from 'kysely';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { buildCommandMessage } from '../../../../test/support/command-message.builder.ts';
import { FakeIdGenerator } from '../../../../test/support/id-generator.fake.ts';
import {
  startKitchenTestDatabase,
  type KitchenTestDatabase,
} from '../../../../test/support/kitchen-database.builder.ts';
import { createTicketInput, orderId, ticketId } from '../../../../test/support/ticket.builder.ts';
import type { DB as KitchenDatabase } from '#infrastructure/persistence/generated/database.ts';
import { createKitchenUnitOfWork } from '#infrastructure/persistence/kitchen-unit-of-work.adapter.ts';
import { PostgresTicketRepository } from '#infrastructure/persistence/postgres-ticket.repository.ts';
import { kitchenCommandConsumer } from './kitchen-command.consumer.ts';

interface OutboxRow {
  readonly topic: string;
  readonly aggregateId: string;
  readonly messageType: string;
  readonly payload: Uint8Array;
  readonly sagaId: string | null;
  readonly correlationId: string;
  readonly causationId: string | null;
}

const sagaId = '0199a5d0-0000-7000-8000-0000000000b1';
const processedAt = new Date('2026-10-02T12:00:02.000Z');
const { restaurantId, lineItems } = createTicketInput();
const createTicket = { orderId, restaurantId, lineItems: [...lineItems] };

let testDatabase: KitchenTestDatabase;
let handleCommand: MessageHandler;
let consumeCommand: TransactionalMessageHandler<KitchenDatabase>;
let inboxSettings: InboxSettings<KitchenDatabase>;
let messageCount = 0;

async function readOutbox(): Promise<readonly OutboxRow[]> {
  const result = await sql<OutboxRow>`
    select topic, aggregate_id, message_type, payload, saga_id, correlation_id, causation_id
    from outbox order by id
  `.execute(testDatabase.database);
  return result.rows;
}

async function countRows(table: 'tickets' | 'inbox'): Promise<number> {
  const result = await sql`select 1 from ${sql.table(table)}`.execute(testDatabase.database);
  return result.rows.length;
}

beforeAll(async () => {
  testDatabase = await startKitchenTestDatabase();
});

beforeEach(async () => {
  await testDatabase.clearWrittenRows();
  const unitOfWork = createKitchenUnitOfWork({
    database: testDatabase.database,
    generateMessageId: () => {
      messageCount += 1;
      return `0199a5d0-0000-7000-8000-${messageCount.toString(16).padStart(12, '0')}`;
    },
    now: () => processedAt,
  });
  consumeCommand = kitchenCommandConsumer({
    unitOfWork,
    idGenerator: new FakeIdGenerator(),
    logger: createLogger({ serviceName: 'kitchen-service', level: 'silent' }),
  });
  inboxSettings = {
    database: testDatabase.database,
    handlerName: 'kitchen-command',
    now: () => processedAt,
  };
  handleCommand = withInbox(inboxSettings, consumeCommand);
});

afterAll(async () => {
  await testDatabase.stop();
});

describe('kitchenCommandConsumer', () => {
  it('creates a pending ticket and replies TicketCreated, keyed by saga id and caused by the command', async () => {
    const command = buildCommandMessage(CreateTicketSchema, createTicket);

    await handleCommand(command);

    const ticket = await new PostgresTicketRepository(testDatabase.database).findByOrderId(orderId);
    expect(ticket?.toSnapshot()).toMatchObject({ ticketId, status: 'CREATE_PENDING', lineItems });
    const [reply, ...others] = await readOutbox();
    expect(others).toEqual([]);
    expect(reply).toMatchObject({
      topic: 'order.place-order-saga.replies',
      aggregateId: sagaId,
      messageType: 'fooddelivery.kitchen.v1.TicketCreated',
      sagaId,
      correlationId: command.headers.correlationId,
      causationId: command.headers.messageId,
    });
    expect(fromBinary(TicketCreatedSchema, reply?.payload ?? new Uint8Array())).toMatchObject({
      orderId,
      ticketId,
    });
  });

  it('approves the ticket of the order and replies TicketApproved', async () => {
    await handleCommand(buildCommandMessage(CreateTicketSchema, createTicket));

    await handleCommand(buildCommandMessage(ApproveTicketSchema, { orderId }));

    const ticket = await new PostgresTicketRepository(testDatabase.database).findByOrderId(orderId);
    expect(ticket?.toSnapshot().status).toBe('AWAITING_ACCEPTANCE');
    const replies = await readOutbox();
    expect(replies.map((row) => row.topic)).toEqual([
      'order.place-order-saga.replies',
      'order.place-order-saga.replies',
    ]);
    expect(replies.map((row) => row.messageType)).toEqual([
      'fooddelivery.kitchen.v1.TicketCreated',
      'fooddelivery.kitchen.v1.TicketApproved',
    ]);
    expect(fromBinary(TicketApprovedSchema, replies[1]?.payload ?? new Uint8Array())).toMatchObject(
      { orderId, ticketId },
    );
  });

  it('creates one ticket for a redelivered CreateTicket', async () => {
    const command = buildCommandMessage(CreateTicketSchema, createTicket);

    await handleCommand(command);
    await handleCommand(command);

    expect(await readOutbox()).toHaveLength(1);
    expect(await countRows('tickets')).toBe(1);
  });

  it('rolls back the ticket, the reply and the inbox row when the inbox transaction fails', async () => {
    const command = buildCommandMessage(CreateTicketSchema, createTicket);
    const failingHandleCommand = withInbox(inboxSettings, async (message, transaction) => {
      await consumeCommand(message, transaction);
      throw new Error('inbox transaction failed');
    });

    await expect(failingHandleCommand(command)).rejects.toThrow('inbox transaction failed');

    expect(await readOutbox()).toEqual([]);
    expect(await countRows('inbox')).toBe(0);
    expect(await countRows('tickets')).toBe(0);
  });

  it('records an ApproveTicket for an order without ticket as processed without replying', async () => {
    await handleCommand(buildCommandMessage(ApproveTicketSchema, { orderId }));

    expect(await readOutbox()).toEqual([]);
    expect(await countRows('inbox')).toBe(1);
  });

  it('dead-letters a command type the kitchen does not handle', async () => {
    const command = buildCommandMessage(
      ApproveTicketSchema,
      { orderId },
      { messageType: 'fooddelivery.kitchen.v1.RejectTicket' },
    );

    await expect(handleCommand(command)).rejects.toThrow(PermanentMessageFailure);
  });
});
