import { fromBinary } from '@bufbuild/protobuf';
import { withInbox, type InboxSettings, type TransactionalMessageHandler } from '@fd/chassis-inbox';
import {
  ExternalDependencyFailure,
  PermanentMessageFailure,
  type MessageHandler,
} from '@fd/chassis-kafka';
import { createLogger } from '@fd/chassis-observability';
import {
  AuthorizePaymentSchema,
  VoidAuthorizationSchema,
} from '@fd/contracts/fooddelivery/accounting/v1/commands_pb.js';
import {
  AuthorizationVoidedSchema,
  PaymentAuthorizedSchema,
  PaymentFailedSchema,
  PaymentFailureReason,
} from '@fd/contracts/fooddelivery/accounting/v1/replies_pb.js';
import { sql } from 'kysely';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import {
  startAccountingTestDatabase,
  type AccountingTestDatabase,
} from '../../../../test/support/accounting-database.builder.ts';
import { buildCommandMessage } from '../../../../test/support/command-message.builder.ts';
import {
  authorizePaymentInput,
  orderId,
  paymentId,
  restaurantId,
} from '../../../../test/support/payment.builder.ts';
import { createAccountingUnitOfWork } from '#infrastructure/persistence/accounting-unit-of-work.adapter.ts';
import { PostgresPaymentRepository } from '#infrastructure/persistence/postgres-payment.repository.ts';
import { SimulatedPaymentGateway } from '#infrastructure/payment/simulated-payment-gateway.adapter.ts';
import type { DB as AccountingDatabase } from '#infrastructure/persistence/generated/database.ts';
import { accountingCommandConsumer } from './accounting-command.consumer.ts';

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
const { consumerId, authorizedAt, gatewayAuthorizationId } = authorizePaymentInput();
const authorizePayment = {
  orderId,
  consumerId,
  restaurantId,
  amountInCents: 9800n,
  deliveryFeeInCents: 800n,
  currency: 'BRL',
  paymentToken: 'tok_visa_4242',
};

let testDatabase: AccountingTestDatabase;
let handleCommand: MessageHandler;
let consumeCommand: TransactionalMessageHandler<AccountingDatabase>;
let inboxSettings: InboxSettings<AccountingDatabase>;
let messageCount = 0;
let voidCount = 0;

async function countRows(table: 'payments' | 'inbox'): Promise<number> {
  const result = await sql`select 1 from ${sql.table(table)}`.execute(testDatabase.database);
  return result.rows.length;
}

function failingInboxTransaction(): MessageHandler {
  return withInbox(inboxSettings, async (message, transaction) => {
    await consumeCommand(message, transaction);
    throw new Error('inbox transaction failed');
  });
}

async function readPaymentSnapshot() {
  const payment = await new PostgresPaymentRepository(testDatabase.database).findByOrderId(orderId);
  return payment?.toSnapshot();
}

async function readMessageTypes(): Promise<readonly string[]> {
  return (await readOutbox()).map((row) => row.messageType);
}

async function readOutbox(): Promise<readonly OutboxRow[]> {
  const result = await sql<OutboxRow>`
    select topic, aggregate_id, message_type, payload, saga_id, correlation_id, causation_id
    from outbox order by id
  `.execute(testDatabase.database);
  return result.rows;
}

beforeAll(async () => {
  testDatabase = await startAccountingTestDatabase();
});

beforeEach(async () => {
  await testDatabase.clearWrittenRows();
  voidCount = 0;
  const unitOfWork = createAccountingUnitOfWork({
    database: testDatabase.database,
    generateMessageId: () => {
      messageCount += 1;
      return `0199a5d0-0000-7000-8000-${messageCount.toString(16).padStart(12, '0')}`;
    },
    now: () => authorizedAt,
  });
  consumeCommand = accountingCommandConsumer({
    unitOfWork,
    paymentGateway: new SimulatedPaymentGateway({
      slowResponseInMilliseconds: 0,
      generateAuthorizationId: () => gatewayAuthorizationId,
      generateVoidId: () => {
        voidCount += 1;
        return `void-${String(voidCount)}`;
      },
    }),
    idGenerator: { generatePaymentId: () => paymentId },
    clock: { now: () => authorizedAt },
    logger: createLogger({ serviceName: 'accounting-service', level: 'silent' }),
  });
  inboxSettings = {
    database: testDatabase.database,
    handlerName: 'accounting-command',
    now: () => authorizedAt,
  };
  handleCommand = withInbox(inboxSettings, consumeCommand);
});

afterAll(async () => {
  await testDatabase.stop();
});

describe('accountingCommandConsumer', () => {
  it('records the authorized payment and replies PaymentAuthorized, keyed by saga id and caused by the command', async () => {
    const command = buildCommandMessage(AuthorizePaymentSchema, authorizePayment);

    await handleCommand(command);

    const payment = await new PostgresPaymentRepository(testDatabase.database).findByOrderId(
      orderId,
    );
    expect(payment?.toSnapshot()).toEqual({
      ...authorizePaymentInput(),
      state: { status: 'AUTHORIZED' },
      version: 1,
    });
    const [reply, ...others] = await readOutbox();
    expect(others).toEqual([]);
    expect(reply).toMatchObject({
      topic: 'order.place-order-saga.replies',
      aggregateId: sagaId,
      messageType: 'fooddelivery.accounting.v1.PaymentAuthorized',
      sagaId,
      correlationId: command.headers.correlationId,
      causationId: command.headers.messageId,
    });
    expect(fromBinary(PaymentAuthorizedSchema, reply?.payload ?? new Uint8Array())).toMatchObject({
      orderId,
      paymentId,
    });
  });

  it('authorizes a redelivered command once', async () => {
    const command = buildCommandMessage(AuthorizePaymentSchema, authorizePayment);

    await handleCommand(command);
    await handleCommand(command);

    expect(await readOutbox()).toHaveLength(1);
  });

  it('answers a repeated AuthorizePayment again with the payment it recorded', async () => {
    const first = buildCommandMessage(AuthorizePaymentSchema, authorizePayment);
    const repeated = buildCommandMessage(AuthorizePaymentSchema, authorizePayment);

    await handleCommand(first);
    await handleCommand(repeated);

    const replies = await readOutbox();
    expect(replies).toHaveLength(2);
    expect(replies[1]).toMatchObject({
      topic: 'order.place-order-saga.replies',
      aggregateId: sagaId,
      messageType: 'fooddelivery.accounting.v1.PaymentAuthorized',
      sagaId,
      correlationId: repeated.headers.correlationId,
      causationId: repeated.headers.messageId,
    });
    expect(
      fromBinary(PaymentAuthorizedSchema, replies[1]?.payload ?? new Uint8Array()),
    ).toMatchObject({ orderId, paymentId });
    expect(await countRows('payments')).toBe(1);
    expect(await countRows('inbox')).toBe(2);
  });

  it('rolls back a repeated reply and its inbox row when the inbox transaction fails', async () => {
    await handleCommand(buildCommandMessage(AuthorizePaymentSchema, authorizePayment));
    const repeated = buildCommandMessage(AuthorizePaymentSchema, authorizePayment);

    await expect(failingInboxTransaction()(repeated)).rejects.toThrow('inbox transaction failed');

    expect(await readOutbox()).toHaveLength(1);
    expect(await countRows('inbox')).toBe(1);
  });

  it('rolls back the payment, the reply and the inbox row when the inbox transaction fails', async () => {
    const command = buildCommandMessage(AuthorizePaymentSchema, authorizePayment);

    await expect(failingInboxTransaction()(command)).rejects.toThrow('inbox transaction failed');

    expect(await readOutbox()).toEqual([]);
    expect(await countRows('inbox')).toBe(0);
    expect(await countRows('payments')).toBe(0);
  });

  it('replies PaymentFailed for a declined card together with its inbox row and no payment', async () => {
    const command = buildCommandMessage(AuthorizePaymentSchema, {
      ...authorizePayment,
      paymentToken: 'tok_visa_0002',
    });

    await handleCommand(command);

    const [reply, ...others] = await readOutbox();
    expect(others).toEqual([]);
    expect(reply).toMatchObject({
      topic: 'order.place-order-saga.replies',
      aggregateId: sagaId,
      messageType: 'fooddelivery.accounting.v1.PaymentFailed',
      sagaId,
      causationId: command.headers.messageId,
    });
    expect(fromBinary(PaymentFailedSchema, reply?.payload ?? new Uint8Array())).toMatchObject({
      orderId,
      reason: PaymentFailureReason.PAYMENT_DECLINED,
    });
    expect(await countRows('inbox')).toBe(1);
    expect(await countRows('payments')).toBe(0);
  });

  it('rolls back a failure reply and the inbox row when the inbox transaction fails', async () => {
    const command = buildCommandMessage(AuthorizePaymentSchema, {
      ...authorizePayment,
      paymentToken: 'tok_visa_0002',
    });

    await expect(failingInboxTransaction()(command)).rejects.toThrow('inbox transaction failed');

    expect(await readOutbox()).toEqual([]);
    expect(await countRows('inbox')).toBe(0);
  });

  it('leaves a gateway timeout to the bounded retries of the consumer runner', async () => {
    const command = buildCommandMessage(AuthorizePaymentSchema, {
      ...authorizePayment,
      paymentToken: 'tok_visa_0005',
    });

    await expect(handleCommand(command)).rejects.toThrow(ExternalDependencyFailure);
    expect(await readOutbox()).toEqual([]);
    expect(await countRows('inbox')).toBe(0);
    expect(await countRows('payments')).toBe(0);
  });

  it('voids the authorization of the order and replies AuthorizationVoided, keyed by saga id and caused by the command', async () => {
    await handleCommand(buildCommandMessage(AuthorizePaymentSchema, authorizePayment));
    const voidAuthorization = buildCommandMessage(VoidAuthorizationSchema, { orderId });

    await handleCommand(voidAuthorization);

    expect(await readPaymentSnapshot()).toMatchObject({
      state: { status: 'VOIDED', voidedAt: authorizedAt, gatewayVoidId: 'void-1' },
      version: 2,
    });
    const reply = (await readOutbox()).at(-1);
    expect(reply).toMatchObject({
      topic: 'order.place-order-saga.replies',
      aggregateId: sagaId,
      messageType: 'fooddelivery.accounting.v1.AuthorizationVoided',
      sagaId,
      correlationId: voidAuthorization.headers.correlationId,
      causationId: voidAuthorization.headers.messageId,
    });
    expect(fromBinary(AuthorizationVoidedSchema, reply?.payload ?? new Uint8Array())).toMatchObject(
      { orderId },
    );
  });

  it('answers a repeated VoidAuthorization again without voiding twice', async () => {
    await handleCommand(buildCommandMessage(AuthorizePaymentSchema, authorizePayment));
    await handleCommand(buildCommandMessage(VoidAuthorizationSchema, { orderId }));

    await handleCommand(buildCommandMessage(VoidAuthorizationSchema, { orderId }));

    expect(await readMessageTypes()).toEqual([
      'fooddelivery.accounting.v1.PaymentAuthorized',
      'fooddelivery.accounting.v1.AuthorizationVoided',
      'fooddelivery.accounting.v1.AuthorizationVoided',
    ]);
    expect(voidCount).toBe(1);
    expect(await readPaymentSnapshot()).toMatchObject({ version: 2 });
  });

  it('answers a VoidAuthorization for an order without a payment and stores nothing', async () => {
    await handleCommand(buildCommandMessage(VoidAuthorizationSchema, { orderId }));

    expect(await readMessageTypes()).toEqual(['fooddelivery.accounting.v1.AuthorizationVoided']);
    expect(await countRows('payments')).toBe(0);
    expect(await countRows('inbox')).toBe(1);
    expect(voidCount).toBe(0);
  });

  it('rolls back the void and its reply with the inbox row, and voids at the gateway once across the redelivery', async () => {
    await handleCommand(buildCommandMessage(AuthorizePaymentSchema, authorizePayment));
    const voidAuthorization = buildCommandMessage(VoidAuthorizationSchema, { orderId });

    await expect(failingInboxTransaction()(voidAuthorization)).rejects.toThrow(
      'inbox transaction failed',
    );
    expect(await readPaymentSnapshot()).toMatchObject({
      state: { status: 'AUTHORIZED' },
      version: 1,
    });
    expect(await readMessageTypes()).toEqual(['fooddelivery.accounting.v1.PaymentAuthorized']);

    await handleCommand(voidAuthorization);

    expect(await readPaymentSnapshot()).toMatchObject({
      state: { status: 'VOIDED', gatewayVoidId: 'void-1' },
    });
    expect(await readMessageTypes()).toEqual([
      'fooddelivery.accounting.v1.PaymentAuthorized',
      'fooddelivery.accounting.v1.AuthorizationVoided',
    ]);
    expect(voidCount).toBe(1);
  });

  it('dead-letters a command type it does not handle and voids nothing', async () => {
    await handleCommand(buildCommandMessage(AuthorizePaymentSchema, authorizePayment));
    const unknownCommand = buildCommandMessage(
      VoidAuthorizationSchema,
      { orderId },
      { messageType: 'fooddelivery.accounting.v1.CapturePayment' },
    );

    await expect(handleCommand(unknownCommand)).rejects.toThrow(PermanentMessageFailure);
    expect(await readPaymentSnapshot()).toMatchObject({ state: { status: 'AUTHORIZED' } });
    expect(voidCount).toBe(0);
  });

  it('dead-letters a command with an amount that is not positive', async () => {
    const command = buildCommandMessage(AuthorizePaymentSchema, {
      ...authorizePayment,
      amountInCents: 0n,
    });

    await expect(handleCommand(command)).rejects.toThrow(PermanentMessageFailure);
  });
});
