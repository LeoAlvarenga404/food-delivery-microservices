import { left, right } from '@fd/domain';
import { beforeEach, describe, expect, it } from 'vitest';
import { FakeClock } from '../../../../test/support/clock.fake.ts';
import { InMemoryRestaurantMembershipRepository } from '../../../../test/support/in-memory-restaurant-membership.repository.ts';
import { InMemoryUnitOfWork } from '../../../../test/support/in-memory-unit-of-work.adapter.ts';
import {
  pizzeriaMembership,
  staffAId,
  staffBId,
} from '../../../../test/support/restaurant-membership.builder.ts';
import {
  acceptedAt,
  buildTicketIn,
  createTicketInput,
  orderId,
  readyBy,
  restaurantId,
  ticketId,
  unwrap,
} from '../../../../test/support/ticket.builder.ts';
import { parseRestaurantId } from '#domain/ticket/restaurant-id.value-object.ts';
import { parseTicketId } from '#domain/ticket/ticket-id.value-object.ts';
import type { TicketState, TicketStatus } from '#domain/ticket/ticket.state.ts';
import type { AdvanceTicketCommand, TicketAdvance } from './advance-ticket.command.ts';
import { AdvanceTicketCommandHandler } from './advance-ticket.command-handler.ts';

const metadata = {
  correlationId: '0199a5d0-0000-7000-8000-0000000000e9',
  causationId: undefined,
  actorId: staffAId,
  actorType: 'restaurant_staff',
};
const acceptance = { acceptedAt, readyBy };

let unitOfWork: InMemoryUnitOfWork;
let handler: AdvanceTicketCommandHandler;

function commandTo(advance: TicketAdvance): AdvanceTicketCommand {
  return { principal: { staffMemberId: staffAId }, restaurantId, ticketId, advance, metadata };
}

async function storeTicketIn(state: TicketState): Promise<void> {
  await unitOfWork.tickets.save(buildTicketIn(state));
}

beforeEach(() => {
  unitOfWork = new InMemoryUnitOfWork();
  handler = new AdvanceTicketCommandHandler({
    unitOfWork,
    memberships: new InMemoryRestaurantMembershipRepository([pizzeriaMembership]),
    clock: new FakeClock(acceptedAt),
  });
});

describe('AdvanceTicketCommandHandler', () => {
  it('accepts a ticket for a member, ready by now plus the preparation time, and publishes it', async () => {
    await storeTicketIn({ status: 'AWAITING_ACCEPTANCE' });

    const outcome = await handler.execute(
      commandTo({ type: 'Accept', preparationTimeInMinutes: 15 }),
    );

    expect(outcome).toEqual(
      right({ ...createTicketInput(), state: { status: 'ACCEPTED', ...acceptance }, version: 1 }),
    );
    expect((await unitOfWork.tickets.findById(ticketId))?.toSnapshot()).toMatchObject({
      state: { status: 'ACCEPTED', ...acceptance },
      version: 2,
    });
    expect(unitOfWork.publishedEvents).toEqual([
      {
        eventType: 'TicketAccepted',
        occurredAt: acceptedAt,
        ticketId,
        orderId,
        restaurantId,
        readyBy,
      },
    ]);
    expect(unitOfWork.executedMetadata).toEqual([metadata]);
  });

  it.each<{
    readonly advance: TicketAdvance;
    readonly from: TicketState;
    readonly to: TicketStatus;
    readonly eventType: string;
  }>([
    {
      advance: { type: 'StartPreparing' },
      from: { status: 'ACCEPTED', ...acceptance },
      to: 'PREPARING',
      eventType: 'TicketPreparationStarted',
    },
    {
      advance: { type: 'MarkReady' },
      from: { status: 'PREPARING', ...acceptance },
      to: 'READY_FOR_PICKUP',
      eventType: 'TicketReadyForPickup',
    },
  ])(
    'moves a $from.status ticket to $to and publishes $eventType',
    async ({ advance, from, to, eventType }) => {
      await storeTicketIn(from);

      const outcome = await handler.execute(commandTo(advance));

      expect(outcome.isRight() && outcome.success.state).toEqual({ status: to, ...acceptance });
      expect(unitOfWork.publishedEvents).toEqual([
        { eventType, occurredAt: acceptedAt, ticketId, orderId, restaurantId },
      ]);
    },
  );

  it('refuses a staff member who is not a member before reading the ticket', async () => {
    await storeTicketIn({ status: 'AWAITING_ACCEPTANCE' });

    const outcome = await handler.execute({
      ...commandTo({ type: 'Accept', preparationTimeInMinutes: 15 }),
      principal: { staffMemberId: staffBId },
    });

    expect(outcome).toEqual(
      left({ type: 'NotRestaurantMember', restaurantId, staffMemberId: staffBId }),
    );
    expect(unitOfWork.executedMetadata).toEqual([]);
  });

  it('answers an unknown ticket as not found', async () => {
    const unknownTicketId = unwrap(parseTicketId('0199a5d0-0000-7000-8000-0000000000ff'));

    const outcome = await handler.execute({
      ...commandTo({ type: 'StartPreparing' }),
      ticketId: unknownTicketId,
    });

    expect(outcome).toEqual(
      left({ type: 'TicketNotFound', restaurantId, ticketId: unknownTicketId }),
    );
  });

  it('answers a ticket of another restaurant as not found through this restaurant', async () => {
    const otherRestaurantId = unwrap(parseRestaurantId('0199a5d0-0000-7000-8000-0000000000b7'));
    await unitOfWork.tickets.save(
      buildTicketIn({ status: 'AWAITING_ACCEPTANCE' }, { restaurantId: otherRestaurantId }),
    );

    const outcome = await handler.execute(
      commandTo({ type: 'Accept', preparationTimeInMinutes: 15 }),
    );

    expect(outcome).toEqual(left({ type: 'TicketNotFound', restaurantId, ticketId }));
  });

  it('refuses a preparation time outside one to 120 minutes and keeps the ticket', async () => {
    await storeTicketIn({ status: 'AWAITING_ACCEPTANCE' });

    const outcome = await handler.execute(
      commandTo({ type: 'Accept', preparationTimeInMinutes: 121 }),
    );

    expect(outcome).toEqual(
      left({ type: 'InvalidPreparationTime', preparationTimeInMinutes: 121 }),
    );
    expect((await unitOfWork.tickets.findById(ticketId))?.toSnapshot().state).toEqual({
      status: 'AWAITING_ACCEPTANCE',
    });
  });

  it('refuses to accept a ticket twice, keeping the first acceptance and publishing nothing more', async () => {
    await storeTicketIn({ status: 'AWAITING_ACCEPTANCE' });
    await handler.execute(commandTo({ type: 'Accept', preparationTimeInMinutes: 15 }));

    const outcome = await handler.execute(
      commandTo({ type: 'Accept', preparationTimeInMinutes: 30 }),
    );

    expect(outcome).toEqual(
      left({ type: 'InvalidTicketTransition', ticketId, from: 'ACCEPTED', to: 'ACCEPTED' }),
    );
    expect((await unitOfWork.tickets.findById(ticketId))?.toSnapshot().state).toEqual({
      status: 'ACCEPTED',
      ...acceptance,
    });
    expect(unitOfWork.publishedEvents).toHaveLength(1);
  });
});
