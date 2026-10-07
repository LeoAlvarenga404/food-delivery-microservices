import type { Selectable } from 'kysely';
import type { ConsumerId } from '#domain/ticket/consumer-id.value-object.ts';
import type { OrderId } from '#domain/ticket/order-id.value-object.ts';
import type { RestaurantId } from '#domain/ticket/restaurant-id.value-object.ts';
import type { TicketId } from '#domain/ticket/ticket-id.value-object.ts';
import { Ticket, type TicketLineItem } from '#domain/ticket/ticket.aggregate.ts';
import type {
  AcceptedTicketStatus,
  TicketState,
  UnacceptedTicketStatus,
} from '#domain/ticket/ticket.state.ts';
import type { Tickets } from './generated/database.ts';

export type TicketRow = Selectable<Tickets>;

type AcceptanceColumns = Pick<TicketRow, 'acceptedAt' | 'readyBy'>;

function toTicketState(row: TicketRow): TicketState {
  const { acceptedAt, readyBy } = row;
  if (acceptedAt === null || readyBy === null) {
    return { status: row.status as UnacceptedTicketStatus };
  }
  return { status: row.status as AcceptedTicketStatus, acceptedAt, readyBy };
}

function toAcceptanceColumns(state: TicketState): AcceptanceColumns {
  if (!('acceptedAt' in state)) return { acceptedAt: null, readyBy: null };
  return { acceptedAt: state.acceptedAt, readyBy: state.readyBy };
}

export const ticketPersistenceMapper = {
  toDomain(row: TicketRow): Ticket {
    return Ticket.restore({
      ticketId: row.ticketId as TicketId,
      orderId: row.orderId as OrderId,
      restaurantId: row.restaurantId as RestaurantId,
      consumerId: row.consumerId as ConsumerId,
      lineItems: row.lineItems as unknown as readonly TicketLineItem[],
      state: toTicketState(row),
      version: row.version,
    });
  },

  toPersistence(ticket: Ticket): TicketRow {
    const snapshot = ticket.toSnapshot();
    return {
      ticketId: snapshot.ticketId,
      orderId: snapshot.orderId,
      restaurantId: snapshot.restaurantId,
      consumerId: snapshot.consumerId,
      lineItems: snapshot.lineItems.map(({ menuItemId, name, quantity }) => ({
        menuItemId,
        name,
        quantity,
      })),
      status: snapshot.state.status,
      ...toAcceptanceColumns(snapshot.state),
      version: snapshot.version,
    };
  },
};
