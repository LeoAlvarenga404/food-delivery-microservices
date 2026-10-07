import { fromBinary } from '@bufbuild/protobuf';
import { timestampDate } from '@bufbuild/protobuf/wkt';
import { TicketAcceptedSchema } from '@fd/contracts/fooddelivery/kitchen/v1/events_pb.js';
import { sql } from 'kysely';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { FakeClock } from '../../../test/support/clock.fake.ts';
import {
  startKitchenTestDatabase,
  type KitchenTestDatabase,
} from '../../../test/support/kitchen-database.builder.ts';
import {
  pizzeriaMembership,
  staffAId,
} from '../../../test/support/restaurant-membership.builder.ts';
import {
  acceptedAt,
  buildTicketIn,
  readyBy,
  restaurantId,
  ticketId,
} from '../../../test/support/ticket.builder.ts';
import { AdvanceTicketCommandHandler } from '#application/commands/advance-ticket/advance-ticket.command-handler.ts';
import type { TicketAdvance } from '#application/commands/advance-ticket/advance-ticket.command.ts';
import { createKitchenUnitOfWork } from './kitchen-unit-of-work.adapter.ts';
import { PostgresRestaurantMembershipRepository } from './postgres-restaurant-membership.repository.ts';
import { PostgresTicketRepository } from './postgres-ticket.repository.ts';

interface OutboxRow {
  readonly topic: string;
  readonly aggregateType: string;
  readonly aggregateId: string;
  readonly messageType: string;
  readonly payload: Uint8Array;
  readonly correlationId: string;
  readonly actorId: string | null;
  readonly actorType: string | null;
}

const correlationId = '0199a5d0-0000-7000-8000-0000000000e9';

let testDatabase: KitchenTestDatabase;
let messageCount = 0;

async function readOutbox(): Promise<readonly OutboxRow[]> {
  const result = await sql<OutboxRow>`
    select topic, aggregate_type, aggregate_id, message_type, payload, correlation_id,
      actor_id, actor_type
    from outbox order by id
  `.execute(testDatabase.database);
  return result.rows;
}

function nextMessageId(): string {
  messageCount += 1;
  return `0199a5d0-0000-7000-8000-${messageCount.toString(16).padStart(12, '0')}`;
}

function advanceTicket(
  advance: TicketAdvance,
  generateMessageId: () => string = nextMessageId,
): ReturnType<AdvanceTicketCommandHandler['execute']> {
  const handler = new AdvanceTicketCommandHandler({
    unitOfWork: createKitchenUnitOfWork({
      database: testDatabase.database,
      generateMessageId,
      now: () => acceptedAt,
    }),
    memberships: new PostgresRestaurantMembershipRepository(testDatabase.database),
    clock: new FakeClock(acceptedAt),
  });
  return handler.execute({
    principal: { staffMemberId: staffAId },
    restaurantId,
    ticketId,
    advance,
    metadata: {
      correlationId,
      causationId: undefined,
      actorId: staffAId,
      actorType: 'restaurant_staff',
    },
  });
}

beforeAll(async () => {
  testDatabase = await startKitchenTestDatabase();
});

beforeEach(async () => {
  await testDatabase.clearWrittenRows();
  await new PostgresRestaurantMembershipRepository(testDatabase.database).saveIfNewer(
    pizzeriaMembership,
  );
  await new PostgresTicketRepository(testDatabase.database).save(
    buildTicketIn({ status: 'AWAITING_ACCEPTANCE' }),
  );
});

afterAll(async () => {
  await testDatabase.stop();
});

describe('kitchen unit of work', () => {
  it('writes TicketAccepted to the outbox in the transaction that accepts the ticket', async () => {
    await advanceTicket({ type: 'Accept', preparationTimeInMinutes: 15 });

    const [row, ...others] = await readOutbox();
    expect(others).toEqual([]);
    expect(row).toMatchObject({
      topic: 'kitchen.ticket.events',
      aggregateType: 'Ticket',
      aggregateId: ticketId,
      messageType: 'fooddelivery.kitchen.v1.TicketAccepted',
      correlationId,
      actorId: staffAId,
      actorType: 'restaurant_staff',
    });
    const accepted = fromBinary(TicketAcceptedSchema, row?.payload ?? new Uint8Array());
    expect(accepted.readyBy === undefined ? undefined : timestampDate(accepted.readyBy)).toEqual(
      readyBy,
    );
  });

  it('writes one event per step, in order, as the ticket advances to ready', async () => {
    await advanceTicket({ type: 'Accept', preparationTimeInMinutes: 15 });
    await advanceTicket({ type: 'StartPreparing' });
    await advanceTicket({ type: 'MarkReady' });

    expect((await readOutbox()).map((row) => row.messageType)).toEqual([
      'fooddelivery.kitchen.v1.TicketAccepted',
      'fooddelivery.kitchen.v1.TicketPreparationStarted',
      'fooddelivery.kitchen.v1.TicketReadyForPickup',
    ]);
  });

  it('keeps the ticket awaiting acceptance when the event of its acceptance cannot be written', async () => {
    const outboxFailure = new Error('the outbox row cannot be written');

    const acceptance = advanceTicket({ type: 'Accept', preparationTimeInMinutes: 15 }, () => {
      throw outboxFailure;
    });

    await expect(acceptance).rejects.toThrow(outboxFailure);
    const stored = await new PostgresTicketRepository(testDatabase.database).findById(ticketId);
    expect(stored?.toSnapshot()).toMatchObject({
      state: { status: 'AWAITING_ACCEPTANCE' },
      version: 1,
    });
    expect(await readOutbox()).toEqual([]);
  });

  it('lets one of two simultaneous acceptances win and writes one event, never two', async () => {
    const outcomes = await Promise.allSettled([
      advanceTicket({ type: 'Accept', preparationTimeInMinutes: 15 }),
      advanceTicket({ type: 'Accept', preparationTimeInMinutes: 30 }),
    ]);

    const acceptances = outcomes.filter(
      (outcome) => outcome.status === 'fulfilled' && outcome.value.isRight(),
    );
    expect(acceptances).toHaveLength(1);
    expect((await readOutbox()).map((row) => row.messageType)).toEqual([
      'fooddelivery.kitchen.v1.TicketAccepted',
    ]);
  });
});
