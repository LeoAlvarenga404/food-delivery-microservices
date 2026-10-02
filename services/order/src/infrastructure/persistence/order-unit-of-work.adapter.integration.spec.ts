import { fromBinary } from '@bufbuild/protobuf';
import { runInTransaction } from '@fd/chassis-postgres';
import { VerifyConsumerSchema } from '@fd/contracts/fooddelivery/consumer/v1/commands_pb.js';
import { sql } from 'kysely';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { FakeClock } from '../../../test/support/clock.fake.ts';
import { FakeIdGenerator } from '../../../test/support/id-generator.fake.ts';
import {
  startOrderTestDatabase,
  type OrderTestDatabase,
} from '../../../test/support/order-database.builder.ts';
import {
  buildPlaceOrderCommand,
  requestMetadata,
} from '../../../test/support/place-order-command.builder.ts';
import { PlaceOrderCommandHandler } from '#application/commands/place-order/place-order.command-handler.ts';
import type { UnitOfWork } from '#application/ports/unit-of-work.port.ts';
import {
  createOrderUnitOfWork,
  joinTransaction,
  type OrderUnitOfWork,
} from './order-unit-of-work.adapter.ts';

interface OutboxRow {
  readonly topic: string;
  readonly aggregateId: string;
  readonly messageType: string;
  readonly payload: Uint8Array;
  readonly correlationId: string;
  readonly sagaId: string | null;
}

let testDatabase: OrderTestDatabase;
let unitOfWork: OrderUnitOfWork;
let messageCount = 0;

async function readOutbox(): Promise<readonly OutboxRow[]> {
  const result = await sql<OutboxRow>`
    select topic, aggregate_id, message_type, payload, correlation_id, saga_id
    from outbox order by id
  `.execute(testDatabase.database);
  return result.rows;
}

async function countRows(table: 'orders' | 'saga_instances' | 'idempotency_keys'): Promise<number> {
  const result = await sql<{ readonly rowCount: bigint }>`
    select count(*) as row_count from ${sql.table(table)}
  `.execute(testDatabase.database);
  return Number(result.rows[0]?.rowCount);
}

beforeAll(async () => {
  testDatabase = await startOrderTestDatabase();
});

beforeEach(async () => {
  await testDatabase.clearWrittenRows();
  unitOfWork = createOrderUnitOfWork({
    database: testDatabase.database,
    generateMessageId: () => {
      messageCount += 1;
      return `0199a5d0-0000-7000-8000-${messageCount.toString(16).padStart(12, '0')}`;
    },
    now: () => new Date('2026-10-02T12:00:01.000Z'),
  });
});

afterAll(async () => {
  await testDatabase.stop();
});

function placeOrderWith(orderUnitOfWork: UnitOfWork): PlaceOrderCommandHandler {
  return new PlaceOrderCommandHandler(orderUnitOfWork, new FakeClock(), new FakeIdGenerator());
}

describe('order unit of work', () => {
  it('writes OrderPlaced and the VerifyConsumer command of the saga to the outbox with the order', async () => {
    await placeOrderWith(unitOfWork).execute(buildPlaceOrderCommand());

    const outbox = await readOutbox();

    expect(outbox).toMatchObject([
      {
        topic: 'order.order.events',
        aggregateId: '0199a5d0-0000-7000-8000-0000000000a1',
        messageType: 'fooddelivery.order.v1.OrderPlaced',
        correlationId: requestMetadata.correlationId,
        sagaId: null,
      },
      {
        topic: 'consumer.commands',
        aggregateId: '0199a5d0-0000-7000-8000-0000000000a1',
        messageType: 'fooddelivery.consumer.v1.VerifyConsumer',
        correlationId: requestMetadata.correlationId,
        sagaId: '0199a5d0-0000-7000-8000-0000000000b1',
      },
    ]);
    expect(fromBinary(VerifyConsumerSchema, outbox[1]?.payload ?? new Uint8Array())).toMatchObject({
      consumerId: '0199a5d0-0000-7000-8000-0000000000c1',
      orderId: '0199a5d0-0000-7000-8000-0000000000a1',
    });
  });

  it('writes nothing when the order is rejected', async () => {
    await placeOrderWith(unitOfWork).execute(buildPlaceOrderCommand({ requestedLineItems: [] }));

    expect(await readOutbox()).toEqual([]);
    expect(await countRows('orders')).toBe(0);
    expect(await countRows('idempotency_keys')).toBe(0);
  });

  it('commits or rolls back with the transaction it joined', async () => {
    const rollback = runInTransaction(testDatabase.database, async (transaction) => {
      await placeOrderWith(joinTransaction(unitOfWork, transaction)).execute(
        buildPlaceOrderCommand(),
      );
      throw new Error('the enclosing message handler failed');
    });

    await expect(rollback).rejects.toThrow('the enclosing message handler failed');
    expect(await readOutbox()).toEqual([]);
    expect(await countRows('orders')).toBe(0);
    expect(await countRows('saga_instances')).toBe(0);
  });
});
