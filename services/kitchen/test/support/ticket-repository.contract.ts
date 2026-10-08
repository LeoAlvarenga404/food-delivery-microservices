import { ConcurrencyConflictError } from '@fd/chassis-postgres';
import { beforeEach, describe, expect, it } from 'vitest';
import { parseOrderId, type OrderId } from '#domain/ticket/order-id.value-object.ts';
import { parseRestaurantId } from '#domain/ticket/restaurant-id.value-object.ts';
import { parseTicketId } from '#domain/ticket/ticket-id.value-object.ts';
import type { Ticket } from '#domain/ticket/ticket.aggregate.ts';
import type { TicketRepository } from '#domain/ticket/ticket.repository.ts';
import type { TicketState } from '#domain/ticket/ticket.state.ts';
import {
  acceptedAt,
  buildTicket,
  buildTicketIn,
  fifteenMinutes,
  orderId,
  readyBy,
  restaurantId,
  ticketId,
  unwrap,
} from './ticket.builder.ts';

const preparationStartedAt = new Date('2026-10-06T18:02:00.000Z');
const markedReadyAt = new Date('2026-10-06T18:14:00.000Z');
const acceptance = { acceptedAt, readyBy };

function ticketNumbered(sequence: number, state: TicketState, otherRestaurantId?: string): Ticket {
  const hexadecimal = sequence.toString(16).padStart(2, '0');
  return buildTicketIn(state, {
    ticketId: unwrap(parseTicketId(`0199a5d0-0000-7000-8000-0000000005${hexadecimal}`)),
    orderId: unwrap(parseOrderId(`0199a5d0-0000-7000-8000-0000000006${hexadecimal}`)),
    restaurantId:
      otherRestaurantId === undefined ? restaurantId : unwrap(parseRestaurantId(otherRestaurantId)),
  });
}

async function findStoredTicket(
  tickets: TicketRepository,
  storedOrderId: OrderId,
): Promise<Ticket> {
  const ticket = await tickets.findByOrderId(storedOrderId);
  if (ticket === undefined) throw new Error(`no ticket stored for order ${storedOrderId}`);
  return ticket;
}

async function saveChanged(
  tickets: TicketRepository,
  change: (ticket: Ticket) => unknown,
): Promise<Ticket> {
  const stored = await findStoredTicket(tickets, orderId);
  change(stored);
  await tickets.save(stored);
  return findStoredTicket(tickets, orderId);
}

export function describeTicketRepositoryContract(
  implementationName: string,
  createRepository: () => TicketRepository,
): void {
  describe(`${implementationName} ticket repository`, () => {
    let tickets: TicketRepository;

    beforeEach(() => {
      tickets = createRepository();
    });

    it('finds a saved ticket by its order with its consumer and line items', async () => {
      const ticket = buildTicket();

      await tickets.save(ticket);

      expect((await findStoredTicket(tickets, orderId)).toSnapshot()).toEqual({
        ...ticket.toSnapshot(),
        version: 1,
      });
    });

    it('finds a saved ticket by its id and nothing for an unknown id', async () => {
      await tickets.save(buildTicket());
      const unknownTicketId = unwrap(parseTicketId('0199a5d0-0000-7000-8000-0000000000ff'));

      expect((await tickets.findById(ticketId))?.toSnapshot().orderId).toBe(orderId);
      expect(await tickets.findById(unknownTicketId)).toBeUndefined();
    });

    it('lists the active tickets of a restaurant in creation order', async () => {
      const active = [
        ticketNumbered(5, { status: 'READY_FOR_PICKUP', ...acceptance }),
        ticketNumbered(2, { status: 'AWAITING_ACCEPTANCE' }),
        ticketNumbered(4, { status: 'PREPARING', ...acceptance }),
        ticketNumbered(3, { status: 'ACCEPTED', ...acceptance }),
      ];
      const inactive = [
        ticketNumbered(1, { status: 'CREATE_PENDING' }),
        ticketNumbered(6, { status: 'REJECTED' }),
        ticketNumbered(
          7,
          { status: 'ACCEPTED', ...acceptance },
          '0199a5d0-0000-7000-8000-0000000000b7',
        ),
      ];
      for (const ticket of [...active, ...inactive]) await tickets.save(ticket);

      const listed = await tickets.findActiveByRestaurantId(restaurantId);

      expect(listed.map((ticket) => ticket.toSnapshot().state.status)).toEqual([
        'AWAITING_ACCEPTANCE',
        'ACCEPTED',
        'PREPARING',
        'READY_FOR_PICKUP',
      ]);
      expect(listed.map((ticket) => ticket.toSnapshot().version)).toEqual([1, 1, 1, 1]);
    });

    it('returns undefined for an order without ticket', async () => {
      const otherOrderId = unwrap(parseOrderId('0199a5d0-0000-7000-8000-0000000000af'));

      expect(await tickets.findByOrderId(otherOrderId)).toBeUndefined();
    });

    it('saves the approval of a stored ticket and increments its version', async () => {
      await tickets.save(buildTicket());

      const { state, version } = (
        await saveChanged(tickets, (stored) => stored.approve())
      ).toSnapshot();

      expect({ state, version }).toEqual({ state: { status: 'AWAITING_ACCEPTANCE' }, version: 2 });
    });

    it('saves the rejection of a stored ticket and increments its version', async () => {
      await tickets.save(buildTicket());

      const { state, version } = (
        await saveChanged(tickets, (stored) => stored.reject())
      ).toSnapshot();

      expect({ state, version }).toEqual({ state: { status: 'REJECTED' }, version: 2 });
    });

    it('saves the acceptance with its acceptance and ready-by times', async () => {
      await tickets.save(buildTicket());
      await saveChanged(tickets, (stored) => stored.approve());

      const { state, version } = (
        await saveChanged(tickets, (stored) => stored.accept(fifteenMinutes, acceptedAt))
      ).toSnapshot();

      expect({ state, version }).toEqual({
        state: { status: 'ACCEPTED', acceptedAt, readyBy },
        version: 3,
      });
    });

    it('saves the preparation and the readiness, keeping the times of the acceptance', async () => {
      await tickets.save(buildTicket());
      await saveChanged(tickets, (stored) => stored.approve());
      await saveChanged(tickets, (stored) => stored.accept(fifteenMinutes, acceptedAt));
      const preparing = await saveChanged(tickets, (stored) =>
        stored.startPreparing(preparationStartedAt),
      );

      const ready = await saveChanged(tickets, (stored) => stored.markReady(markedReadyAt));

      expect([preparing.toSnapshot().state, ready.toSnapshot()]).toEqual([
        { status: 'PREPARING', acceptedAt, readyBy },
        {
          ...buildTicket().toSnapshot(),
          state: { status: 'READY_FOR_PICKUP', acceptedAt, readyBy },
          version: 5,
        },
      ]);
    });

    it('rejects a save based on a version another save already replaced', async () => {
      await tickets.save(buildTicket());
      const first = await findStoredTicket(tickets, orderId);
      const second = await findStoredTicket(tickets, orderId);
      unwrap(first.approve());
      unwrap(second.approve());
      await tickets.save(first);

      await expect(tickets.save(second)).rejects.toThrow(ConcurrencyConflictError);
    });

    it('refuses a second ticket for the same order as a concurrency conflict', async () => {
      await tickets.save(buildTicket());
      const otherTicketId = unwrap(parseTicketId('0199a5d0-0000-7000-8000-0000000000f2'));

      await expect(tickets.save(buildTicket({ ticketId: otherTicketId }))).rejects.toThrow(
        ConcurrencyConflictError,
      );
    });

    it('refuses a new ticket whose id is already stored as a concurrency conflict', async () => {
      await tickets.save(buildTicket());
      const otherOrderId = unwrap(parseOrderId('0199a5d0-0000-7000-8000-0000000000af'));

      await expect(tickets.save(buildTicket({ orderId: otherOrderId }))).rejects.toThrow(
        ConcurrencyConflictError,
      );
    });
  });
}
