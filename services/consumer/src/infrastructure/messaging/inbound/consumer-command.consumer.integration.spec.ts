import { fromBinary } from '@bufbuild/protobuf';
import { withInbox, type InboxSettings, type TransactionalMessageHandler } from '@fd/chassis-inbox';
import { PermanentMessageFailure, type MessageHandler } from '@fd/chassis-kafka';
import { createLogger } from '@fd/chassis-observability';
import { VerifyConsumerSchema } from '@fd/contracts/fooddelivery/consumer/v1/commands_pb.js';
import {
  ConsumerVerificationFailedSchema,
  ConsumerVerificationFailureReason,
  ConsumerVerifiedSchema,
} from '@fd/contracts/fooddelivery/consumer/v1/replies_pb.js';
import { sql } from 'kysely';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { buildCommandMessage } from '../../../../test/support/command-message.builder.ts';
import {
  startConsumerTestDatabase,
  type ConsumerTestDatabase,
} from '../../../../test/support/consumer-database.builder.ts';
import {
  activeConsumerId,
  buildConsumer,
  unwrap,
} from '../../../../test/support/consumer.builder.ts';
import type { DB as ConsumerDatabase } from '#infrastructure/persistence/generated/database.ts';
import { parseConsumerId } from '#domain/consumer/consumer-id.value-object.ts';
import { createConsumerUnitOfWork } from '#infrastructure/persistence/consumer-unit-of-work.adapter.ts';
import { consumerCommandConsumer } from './consumer-command.consumer.ts';

interface OutboxRow {
  readonly topic: string;
  readonly aggregateId: string;
  readonly messageType: string;
  readonly payload: Uint8Array;
  readonly sagaId: string | null;
  readonly correlationId: string;
  readonly causationId: string | null;
}

const orderId = '0199a5d0-0000-7000-8000-0000000000a1';
const sagaId = '0199a5d0-0000-7000-8000-0000000000b1';
const blockedConsumerId = unwrap(parseConsumerId('0199a5d0-0000-7000-8000-0000000000c2'));
const unknownConsumerId = unwrap(parseConsumerId('0199a5d0-0000-7000-8000-0000000000cf'));
const processedAt = new Date('2026-10-02T12:00:01.000Z');

let testDatabase: ConsumerTestDatabase;
let handleCommand: MessageHandler;
let consumeCommand: TransactionalMessageHandler<ConsumerDatabase>;
let inboxSettings: InboxSettings<ConsumerDatabase>;
let messageCount = 0;

async function readOutbox(): Promise<readonly OutboxRow[]> {
  const result = await sql<OutboxRow>`
    select topic, aggregate_id, message_type, payload, saga_id, correlation_id, causation_id
    from outbox order by id
  `.execute(testDatabase.database);
  return result.rows;
}

async function countInboxRows(): Promise<number> {
  const result = await sql<{ readonly count: bigint }>`select count(*) from inbox`.execute(
    testDatabase.database,
  );
  return Number(result.rows[0]?.count);
}

function failingInboxTransaction(): MessageHandler {
  return withInbox(inboxSettings, async (message, transaction) => {
    await consumeCommand(message, transaction);
    throw new Error('inbox transaction failed');
  });
}

beforeAll(async () => {
  testDatabase = await startConsumerTestDatabase();
  await testDatabase.replaceConsumers([
    buildConsumer(),
    buildConsumer({ consumerId: blockedConsumerId, status: 'BLOCKED' }),
  ]);
});

beforeEach(async () => {
  await testDatabase.clearWrittenRows();
  const unitOfWork = createConsumerUnitOfWork({
    database: testDatabase.database,
    generateMessageId: () => {
      messageCount += 1;
      return `0199a5d0-0000-7000-8000-${messageCount.toString(16).padStart(12, '0')}`;
    },
    now: () => processedAt,
  });
  consumeCommand = consumerCommandConsumer({
    unitOfWork,
    logger: createLogger({ serviceName: 'consumer-service', level: 'silent' }),
  });
  inboxSettings = {
    database: testDatabase.database,
    handlerName: 'consumer-command',
    now: () => processedAt,
  };
  handleCommand = withInbox(inboxSettings, consumeCommand);
});

afterAll(async () => {
  await testDatabase.stop();
});

describe('consumerCommandConsumer', () => {
  it('replies ConsumerVerified to the saga, keyed by saga id and caused by the command', async () => {
    const command = buildCommandMessage(VerifyConsumerSchema, {
      consumerId: activeConsumerId,
      orderId,
    });

    await handleCommand(command);

    const [reply, ...others] = await readOutbox();
    expect(others).toEqual([]);
    expect(reply).toMatchObject({
      topic: 'order.place-order-saga.replies',
      aggregateId: sagaId,
      messageType: 'fooddelivery.consumer.v1.ConsumerVerified',
      sagaId,
      correlationId: command.headers.correlationId,
      causationId: command.headers.messageId,
    });
    expect(fromBinary(ConsumerVerifiedSchema, reply?.payload ?? new Uint8Array())).toMatchObject({
      consumerId: activeConsumerId,
      orderId,
    });
  });

  it('handles a redelivered command once', async () => {
    const command = buildCommandMessage(VerifyConsumerSchema, {
      consumerId: activeConsumerId,
      orderId,
    });

    await handleCommand(command);
    await handleCommand(command);

    expect(await readOutbox()).toHaveLength(1);
  });

  it('rolls back the reply and the inbox row when the inbox transaction fails', async () => {
    const command = buildCommandMessage(VerifyConsumerSchema, {
      consumerId: activeConsumerId,
      orderId,
    });

    await expect(failingInboxTransaction()(command)).rejects.toThrow('inbox transaction failed');

    expect(await readOutbox()).toEqual([]);
    expect(await countInboxRows()).toBe(0);
  });

  it.each([
    {
      consumer: 'a blocked consumer',
      consumerId: blockedConsumerId,
      reason: ConsumerVerificationFailureReason.CONSUMER_BLOCKED,
    },
    {
      consumer: 'a consumer it does not know',
      consumerId: unknownConsumerId,
      reason: ConsumerVerificationFailureReason.CONSUMER_NOT_FOUND,
    },
  ])(
    'replies ConsumerVerificationFailed for $consumer together with its inbox row',
    async ({ consumerId, reason }) => {
      const command = buildCommandMessage(VerifyConsumerSchema, { consumerId, orderId });

      await handleCommand(command);

      const [reply, ...others] = await readOutbox();
      expect(others).toEqual([]);
      expect(reply).toMatchObject({
        topic: 'order.place-order-saga.replies',
        aggregateId: sagaId,
        messageType: 'fooddelivery.consumer.v1.ConsumerVerificationFailed',
        sagaId,
        causationId: command.headers.messageId,
      });
      expect(
        fromBinary(ConsumerVerificationFailedSchema, reply?.payload ?? new Uint8Array()),
      ).toMatchObject({ consumerId, orderId, reason });
      expect(await countInboxRows()).toBe(1);
    },
  );

  it('rolls back a failure reply and the inbox row when the inbox transaction fails', async () => {
    const command = buildCommandMessage(VerifyConsumerSchema, {
      consumerId: blockedConsumerId,
      orderId,
    });

    await expect(failingInboxTransaction()(command)).rejects.toThrow('inbox transaction failed');

    expect(await readOutbox()).toEqual([]);
    expect(await countInboxRows()).toBe(0);
  });

  it('dead-letters a command without saga id and keeps it out of the inbox', async () => {
    const command = buildCommandMessage(
      VerifyConsumerSchema,
      { consumerId: activeConsumerId, orderId },
      { sagaId: undefined },
    );

    await expect(handleCommand(command)).rejects.toThrow(PermanentMessageFailure);
    expect(await countInboxRows()).toBe(0);
  });
});
