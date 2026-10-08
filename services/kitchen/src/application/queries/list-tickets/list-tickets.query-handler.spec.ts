import { left, right } from '@fd/domain';
import { beforeEach, describe, expect, it } from 'vitest';
import { InMemoryRestaurantMembershipRepository } from '../../../../test/support/in-memory-restaurant-membership.repository.ts';
import { InMemoryTicketRepository } from '../../../../test/support/in-memory-ticket.repository.ts';
import {
  pizzeriaMembership,
  staffAId,
  staffBId,
} from '../../../../test/support/restaurant-membership.builder.ts';
import {
  acceptedAt,
  buildTicketIn,
  readyBy,
  restaurantId,
  unwrap,
} from '../../../../test/support/ticket.builder.ts';
import { parseOrderId } from '#domain/ticket/order-id.value-object.ts';
import { parseTicketId } from '#domain/ticket/ticket-id.value-object.ts';
import { ListTicketsQueryHandler } from './list-tickets.query-handler.ts';

const accepted = buildTicketIn({ status: 'ACCEPTED', acceptedAt, readyBy });
const rejected = buildTicketIn(
  { status: 'REJECTED' },
  {
    ticketId: unwrap(parseTicketId('0199a5d0-0000-7000-8000-0000000000f2')),
    orderId: unwrap(parseOrderId('0199a5d0-0000-7000-8000-0000000000a2')),
  },
);

let tickets: InMemoryTicketRepository;
let handler: ListTicketsQueryHandler;

beforeEach(async () => {
  tickets = new InMemoryTicketRepository();
  await tickets.save(accepted);
  await tickets.save(rejected);
  handler = new ListTicketsQueryHandler({
    tickets,
    memberships: new InMemoryRestaurantMembershipRepository([pizzeriaMembership]),
  });
});

describe('ListTicketsQueryHandler', () => {
  it('lists the active tickets of the restaurant to one of its members', async () => {
    const outcome = await handler.execute({ principal: { staffMemberId: staffAId }, restaurantId });

    expect(outcome).toEqual(right([{ ...accepted.toSnapshot(), version: 1 }]));
  });

  it('refuses a staff member who is not a member', async () => {
    const outcome = await handler.execute({ principal: { staffMemberId: staffBId }, restaurantId });

    expect(outcome).toEqual(
      left({ type: 'NotRestaurantMember', restaurantId, staffMemberId: staffBId }),
    );
  });
});
