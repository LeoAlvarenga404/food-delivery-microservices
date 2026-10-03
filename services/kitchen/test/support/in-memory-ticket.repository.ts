import { ConcurrencyConflictError } from '@fd/chassis-postgres';
import type { OrderId } from '#domain/ticket/order-id.value-object.ts';
import type { Ticket } from '#domain/ticket/ticket.aggregate.ts';
import type { TicketRepository } from '#domain/ticket/ticket.repository.ts';
import {
  ticketPersistenceMapper,
  type TicketRow,
} from '#infrastructure/persistence/ticket.persistence-mapper.ts';

export class InMemoryTicketRepository implements TicketRepository {
  readonly rows = new Map<string, TicketRow>();

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
      return Promise.reject(new Error(`order ${row.orderId} already has a ticket`));
    }
    this.rows.set(row.ticketId, { ...row, version: row.version + 1 });
    return Promise.resolve();
  }
}
