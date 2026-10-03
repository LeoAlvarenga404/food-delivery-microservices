import { ConcurrencyConflictError } from '@fd/chassis-postgres';
import { beforeEach, describe, expect, it } from 'vitest';
import { parseOrderId, type OrderId } from '#domain/ticket/order-id.value-object.ts';
import { parseTicketId } from '#domain/ticket/ticket-id.value-object.ts';
import type { Ticket } from '#domain/ticket/ticket.aggregate.ts';
import type { TicketRepository } from '#domain/ticket/ticket.repository.ts';
import { buildTicket, orderId, unwrap } from './ticket.builder.ts';

async function findStoredTicket(
  tickets: TicketRepository,
  storedOrderId: OrderId,
): Promise<Ticket> {
  const ticket = await tickets.findByOrderId(storedOrderId);
  if (ticket === undefined) throw new Error(`no ticket stored for order ${storedOrderId}`);
  return ticket;
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

    it('finds a saved ticket by its order with its line items', async () => {
      const ticket = buildTicket();

      await tickets.save(ticket);

      expect((await findStoredTicket(tickets, orderId)).toSnapshot()).toEqual({
        ...ticket.toSnapshot(),
        version: 1,
      });
    });

    it('returns undefined for an order without ticket', async () => {
      const otherOrderId = unwrap(parseOrderId('0199a5d0-0000-7000-8000-0000000000af'));

      expect(await tickets.findByOrderId(otherOrderId)).toBeUndefined();
    });

    it('saves the approval of a stored ticket and increments its version', async () => {
      await tickets.save(buildTicket());
      const stored = await findStoredTicket(tickets, orderId);
      unwrap(stored.approve());

      await tickets.save(stored);
      const { status, version } = (await findStoredTicket(tickets, orderId)).toSnapshot();

      expect({ status, version }).toEqual({ status: 'AWAITING_ACCEPTANCE', version: 2 });
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

    it('refuses a second ticket for the same order', async () => {
      await tickets.save(buildTicket());
      const otherTicketId = unwrap(parseTicketId('0199a5d0-0000-7000-8000-0000000000f2'));

      await expect(tickets.save(buildTicket({ ticketId: otherTicketId }))).rejects.toThrow();
    });
  });
}
