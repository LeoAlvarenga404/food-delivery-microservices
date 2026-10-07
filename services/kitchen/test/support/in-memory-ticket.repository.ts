import { ConcurrencyConflictError } from '@fd/chassis-postgres';
import type { OrderId } from '#domain/ticket/order-id.value-object.ts';
import type { RestaurantId } from '#domain/ticket/restaurant-id.value-object.ts';
import type { Ticket } from '#domain/ticket/ticket.aggregate.ts';
import type { TicketId } from '#domain/ticket/ticket-id.value-object.ts';
import type { TicketRepository } from '#domain/ticket/ticket.repository.ts';
import { activeTicketStatuses } from '#domain/ticket/ticket.state.ts';
import {
  ticketPersistenceMapper,
  type TicketRow,
} from '#infrastructure/persistence/ticket.persistence-mapper.ts';

export class InMemoryTicketRepository implements TicketRepository {
  readonly rows = new Map<string, TicketRow>();

  findById(ticketId: TicketId): Promise<Ticket | undefined> {
    const row = this.rows.get(ticketId);
    return Promise.resolve(row === undefined ? undefined : ticketPersistenceMapper.toDomain(row));
  }

  findActiveByRestaurantId(restaurantId: RestaurantId): Promise<readonly Ticket[]> {
    const rows = [...this.rows.values()]
      .filter((row) => row.restaurantId === restaurantId)
      .filter((row) => activeTicketStatuses.some((status) => status === row.status))
      .sort((first, second) => (first.ticketId < second.ticketId ? -1 : 1));
    return Promise.resolve(rows.map((row) => ticketPersistenceMapper.toDomain(row)));
  }

  findByOrderId(orderId: OrderId): Promise<Ticket | undefined> {
    const row = [...this.rows.values()].find((stored) => stored.orderId === orderId);
    return Promise.resolve(row === undefined ? undefined : ticketPersistenceMapper.toDomain(row));
  }

  save(ticket: Ticket): Promise<void> {
    const row = ticketPersistenceMapper.toPersistence(ticket);
    const stored = this.rows.get(row.ticketId);
    if ((stored?.version ?? 0) !== row.version) {
      return Promise.reject(new ConcurrencyConflictError(`ticket ${row.ticketId} changed`));
    }
    if (
      stored === undefined &&
      [...this.rows.values()].some((other) => other.orderId === row.orderId)
    ) {
      return Promise.reject(
        new ConcurrencyConflictError(`order ${row.orderId} already has a ticket`),
      );
    }
    this.rows.set(row.ticketId, { ...row, version: row.version + 1 });
    return Promise.resolve();
  }
}
