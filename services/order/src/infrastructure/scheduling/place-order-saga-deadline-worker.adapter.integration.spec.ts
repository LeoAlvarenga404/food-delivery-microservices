import { Writable } from 'node:stream';
import { createLogger, type Logger } from '@fd/chassis-observability';
import { sql } from 'kysely';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { FakeClock } from '../../../test/support/clock.fake.ts';
import { FakeIdGenerator } from '../../../test/support/id-generator.fake.ts';
import {
  startOrderTestDatabase,
  type OrderTestDatabase,
} from '../../../test/support/order-database.builder.ts';
import { buildOrder, unwrap } from '../../../test/support/order.builder.ts';
import { buildPlaceOrderCommand } from '../../../test/support/place-order-command.builder.ts';
import {
  buildSagaInstance,
  buildSagaOrder,
  sagaTimeoutsInMilliseconds,
} from '../../../test/support/place-order-saga.builder.ts';
import { PlaceOrderCommandHandler } from '#application/commands/place-order/place-order.command-handler.ts';
import type { PlaceOrderSagaState } from '#application/sagas/place-order/place-order.saga-state.ts';
import {
  createOrderUnitOfWork,
  type OrderUnitOfWork,
} from '#infrastructure/persistence/order-unit-of-work.adapter.ts';
import { PostgresOrderRepository } from '#infrastructure/persistence/postgres-order.repository.ts';
import { PostgresPlaceOrderSagaRepository } from '#infrastructure/persistence/postgres-place-order-saga.repository.ts';
import { PlaceOrderSagaDeadlineWorker } from './place-order-saga-deadline-worker.adapter.ts';

interface OutboxRow {
  readonly topic: string;
  readonly aggregateId: string;
  readonly messageType: string;
  readonly sagaId: string | null;
  readonly correlationId: string;
  readonly causationId: string | null;
}

const verificationDeadline = new Date('2026-10-02T12:00:10.000Z');
const afterEveryDeadline = new Date('2026-10-02T12:05:00.000Z');

let testDatabase: OrderTestDatabase;
let unitOfWork: OrderUnitOfWork;
let logEntries: Record<string, unknown>[];
let messageCount = 0;
let correlationCount = 0;

function timeoutCorrelationId(sequence: number): string {
  return `0199a5d0-0000-7000-8000-${sequence.toString(16).padStart(12, '0')}`;
}

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

function workerAt(now: Date): PlaceOrderSagaDeadlineWorker {
  return new PlaceOrderSagaDeadlineWorker({
    database: testDatabase.database,
    unitOfWork,
    clock: new FakeClock(now),
    sagaTimeoutsInMilliseconds,
    generateCorrelationId: () => {
      correlationCount += 1;
      return timeoutCorrelationId(correlationCount);
    },
    logger: captureLogger(),
  });
}

const defaultExpiredDeadline = new Date('2026-10-02T12:01:00.000Z');

async function saveExpiredSaga(
  sagaId: string,
  state: PlaceOrderSagaState,
  deadlineAt: Date = defaultExpiredDeadline,
): Promise<void> {
  await new PostgresPlaceOrderSagaRepository(testDatabase.database).save({
    ...buildSagaInstance(state),
    sagaId,
    deadlineAt,
  });
}

async function readOutbox(): Promise<readonly OutboxRow[]> {
  const result = await sql<OutboxRow>`
    select topic, aggregate_id, message_type, saga_id, correlation_id, causation_id
    from outbox order by id
  `.execute(testDatabase.database);
  return result.rows;
}

async function readSaga(sagaId: string) {
  return new PostgresPlaceOrderSagaRepository(testDatabase.database).findById(sagaId);
}

beforeAll(async () => {
  testDatabase = await startOrderTestDatabase();
});

beforeEach(async () => {
  await testDatabase.clearWrittenRows();
  logEntries = [];
  correlationCount = 0;
  unitOfWork = createOrderUnitOfWork({
    database: testDatabase.database,
    generateMessageId: () => {
      messageCount += 1;
      return `0199a5d0-0000-7000-8000-${messageCount.toString(16).padStart(12, '0')}`;
    },
    now: () => afterEveryDeadline,
  });
});

afterAll(async () => {
  await testDatabase.stop();
});

describe('PlaceOrderSagaDeadlineWorker', () => {
  it('rejects an order whose consumer was not verified before the deadline, under a new correlation id', async () => {
    const placeOrder = new PlaceOrderCommandHandler({
      unitOfWork,
      clock: new FakeClock(),
      idGenerator: new FakeIdGenerator(),
      sagaTimeoutsInMilliseconds,
    });
    unwrap(await placeOrder.execute(buildPlaceOrderCommand()));
    const timedOutAt = new Date(verificationDeadline.getTime() + 1);

    const timedOutCount = await workerAt(timedOutAt).timeOutExpiredSteps();

    const { orderId } = buildOrder().toSnapshot();
    const order = await new PostgresOrderRepository(testDatabase.database).findById(orderId);
    expect(timedOutCount).toBe(1);
    expect(order?.toSnapshot().state).toEqual({
      status: 'REJECTED',
      rejectionReason: 'CONSUMER_VERIFICATION_TIMED_OUT',
      rejectedAt: timedOutAt,
    });
    expect(await readSaga('0199a5d0-0000-7000-8000-0000000000b1')).toMatchObject({
      state: { step: 'COMPENSATED' },
      deadlineAt: undefined,
    });
    expect((await readOutbox()).at(-1)).toMatchObject({
      topic: 'order.order.events',
      messageType: 'fooddelivery.order.v1.OrderRejected',
      correlationId: timeoutCorrelationId(1),
      causationId: null,
    });
    expect(logEntries).toContainEqual(
      expect.objectContaining({
        msg: 'place order saga step timed out',
        sagaId: '0199a5d0-0000-7000-8000-0000000000b1',
        orderId,
        correlationId: timeoutCorrelationId(1),
      }),
    );
  });

  it('leaves a saga alone while its deadline has not passed', async () => {
    const placeOrder = new PlaceOrderCommandHandler({
      unitOfWork,
      clock: new FakeClock(),
      idGenerator: new FakeIdGenerator(),
      sagaTimeoutsInMilliseconds,
    });
    unwrap(await placeOrder.execute(buildPlaceOrderCommand()));

    const timedOutCount = await workerAt(verificationDeadline).timeOutExpiredSteps();

    expect(timedOutCount).toBe(0);
    expect(await readSaga('0199a5d0-0000-7000-8000-0000000000b1')).toMatchObject({
      state: { step: 'VERIFYING_CONSUMER' },
      version: 1,
    });
  });

  it('asks the kitchen to reject the ticket of a saga whose ticket step timed out', async () => {
    const sagaId = '0199a5d0-0000-7000-8000-0000000002b1';
    const order = buildSagaOrder();
    await saveExpiredSaga(sagaId, {
      step: 'CREATING_TICKET',
      order,
      paymentToken: 'tok_visa_4242',
    });

    await workerAt(afterEveryDeadline).timeOutExpiredSteps();

    expect(await readOutbox()).toMatchObject([
      {
        topic: 'kitchen.commands',
        aggregateId: order.orderId,
        messageType: 'fooddelivery.kitchen.v1.RejectTicket',
        sagaId,
      },
    ]);
    expect(await readSaga(sagaId)).toMatchObject({
      state: { step: 'REJECTING_TICKET', rejectionReason: 'TICKET_CREATION_TIMED_OUT' },
      deadlineAt: new Date('2026-10-02T12:05:40.000Z'),
    });
  });

  it('times out each saga once when two workers sweep at the same time', async () => {
    const sagaIds = Array.from(
      { length: 10 },
      (unused, index) => `0199a5d0-0000-7000-8000-0000000003${index.toString(16).padStart(2, '0')}`,
    );
    for (const sagaId of sagaIds) {
      await saveExpiredSaga(sagaId, { step: 'APPROVING_TICKET', order: buildSagaOrder() });
    }

    const counts = await Promise.all([
      workerAt(afterEveryDeadline).timeOutExpiredSteps(),
      workerAt(afterEveryDeadline).timeOutExpiredSteps(),
    ]);

    const approvals = (await readOutbox()).filter(
      (row) => row.messageType === 'fooddelivery.kitchen.v1.ApproveTicket',
    );
    expect(counts[0] + counts[1]).toBe(10);
    expect(approvals.map((row) => row.sagaId).sort()).toEqual(sagaIds);
    for (const sagaId of sagaIds) {
      expect((await readSaga(sagaId))?.version).toBe(2);
    }
  });

  it('keeps timing out the other sagas when one of them fails', async () => {
    const orphanSagaId = '0199a5d0-0000-7000-8000-0000000004b1';
    const ticketSagaId = '0199a5d0-0000-7000-8000-0000000004b2';
    await saveExpiredSaga(orphanSagaId, {
      step: 'VERIFYING_CONSUMER',
      order: buildSagaOrder(),
      paymentToken: 'tok_visa_4242',
    });
    await saveExpiredSaga(ticketSagaId, {
      step: 'CREATING_TICKET',
      order: buildSagaOrder(),
      paymentToken: 'tok_visa_4242',
    });

    await workerAt(afterEveryDeadline).timeOutExpiredSteps();

    expect((await readSaga(orphanSagaId))?.state.step).toBe('VERIFYING_CONSUMER');
    expect((await readSaga(ticketSagaId))?.state.step).toBe('REJECTING_TICKET');
    expect(logEntries).toContainEqual(
      expect.objectContaining({
        level: 50,
        msg: 'place order saga timeout failed',
        sagaId: orphanSagaId,
      }),
    );
  });

  it('gives each saga timed out in one sweep its own correlation id', async () => {
    const sagaIds = [
      '0199a5d0-0000-7000-8000-0000000005b1',
      '0199a5d0-0000-7000-8000-0000000005b2',
    ];
    for (const sagaId of sagaIds) {
      await saveExpiredSaga(sagaId, { step: 'APPROVING_TICKET', order: buildSagaOrder() });
    }

    await workerAt(afterEveryDeadline).timeOutExpiredSteps();

    const correlationIds = (await readOutbox()).map((row) => row.correlationId);
    expect(new Set(correlationIds).size).toBe(2);
  });

  it('postpones a saga whose timeout is ignored and logs the ignored timeout', async () => {
    const sagaId = '0199a5d0-0000-7000-8000-0000000006b1';
    const order = buildOrder();
    order.reject('CONSUMER_VERIFICATION_TIMED_OUT', new Date('2026-10-02T12:00:30.000Z'));
    await new PostgresOrderRepository(testDatabase.database).save(order);
    await saveExpiredSaga(sagaId, {
      step: 'VERIFYING_CONSUMER',
      order: buildSagaOrder(),
      paymentToken: 'tok_visa_4242',
    });

    await workerAt(afterEveryDeadline).timeOutExpiredSteps();

    expect(logEntries).toContainEqual(
      expect.objectContaining({ level: 40, msg: 'place order saga timeout ignored', sagaId }),
    );
    expect((await readSaga(sagaId))?.deadlineAt).toEqual(
      new Date(afterEveryDeadline.getTime() + 60_000),
    );
  });

  it('keeps expiring healthy sagas behind a hundred sagas whose timeout keeps failing', async () => {
    const failingSagaIds = Array.from(
      { length: 100 },
      (unused, index) => `0199a5d0-0000-7000-8000-0000000007${index.toString(16).padStart(2, '0')}`,
    );
    const healthySagaId = '0199a5d0-0000-7000-8000-0000000008b1';
    for (const sagaId of failingSagaIds) {
      await saveExpiredSaga(sagaId, {
        step: 'VERIFYING_CONSUMER',
        order: buildSagaOrder(),
        paymentToken: 'tok_visa_4242',
      });
    }
    await saveExpiredSaga(
      healthySagaId,
      { step: 'CREATING_TICKET', order: buildSagaOrder(), paymentToken: 'tok_visa_4242' },
      new Date('2026-10-02T12:02:00.000Z'),
    );

    await workerAt(afterEveryDeadline).timeOutExpiredSteps();
    await workerAt(afterEveryDeadline).timeOutExpiredSteps();

    expect((await readSaga(healthySagaId))?.state.step).toBe('REJECTING_TICKET');
    const postponedDeadline = new Date(afterEveryDeadline.getTime() + 60_000);
    for (const sagaId of failingSagaIds) {
      expect((await readSaga(sagaId))?.deadlineAt).toEqual(postponedDeadline);
    }
  });
});
