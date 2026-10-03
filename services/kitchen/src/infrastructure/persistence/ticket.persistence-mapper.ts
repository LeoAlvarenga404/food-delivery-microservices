import type { Selectable } from 'kysely';
import type { OrderId } from '#domain/ticket/order-id.value-object.ts';
import type { TicketId } from '#domain/ticket/ticket-id.value-object.ts';
import { Ticket, type TicketLineItem } from '#domain/ticket/ticket.aggregate.ts';
import type { TicketStatus } from '#domain/ticket/ticket.state.ts';
import type { Tickets } from './generated/database.ts';

export type TicketRow = Selectable<Tickets>;

export const ticketPersistenceMapper = {
  toDomain(row: TicketRow): Ticket {
    return Ticket.restore({
      ticketId: row.ticketId as TicketId,
      orderId: row.orderId as OrderId,
      restaurantId: row.restaurantId,
      lineItems: row.lineItems as unknown as readonly TicketLineItem[],
      status: row.status as TicketStatus,
      version: row.version,
    });
  },

  toPersistence(ticket: Ticket): TicketRow {
    const snapshot = ticket.toSnapshot();
    return {
      ticketId: snapshot.ticketId,
      orderId: snapshot.orderId,
      restaurantId: snapshot.restaurantId,
      lineItems: snapshot.lineItems.map(({ menuItemId, name, quantity }) => ({
        menuItemId,
        name,
        quantity,
      })),
      status: snapshot.status,
      version: snapshot.version,
    };
  },
};
