import { ConcurrencyConflictError } from '@fd/chassis-postgres';
import type { Kysely } from 'kysely';
import type { OrderId } from '#domain/ticket/order-id.value-object.ts';
import type { Ticket } from '#domain/ticket/ticket.aggregate.ts';
import type { TicketRepository } from '#domain/ticket/ticket.repository.ts';
import type { DB as KitchenDatabase } from './generated/database.ts';
import { ticketPersistenceMapper, type TicketRow } from './ticket.persistence-mapper.ts';

export class PostgresTicketRepository implements TicketRepository {
  readonly #database: Kysely<KitchenDatabase>;

  constructor(database: Kysely<KitchenDatabase>) {
    this.#database = database;
  }

  async findByOrderId(orderId: OrderId): Promise<Ticket | undefined> {
    const row = await this.#database
      .selectFrom('tickets')
      .selectAll()
      .where('orderId', '=', orderId)
      .executeTakeFirst();
    return row === undefined ? undefined : ticketPersistenceMapper.toDomain(row);
  }

  async save(ticket: Ticket): Promise<void> {
    const row = ticketPersistenceMapper.toPersistence(ticket);
    if (row.version === 0) {
      await this.#insert(row);
      return;
    }
    await this.#update(row);
  }

  async #insert(row: TicketRow): Promise<void> {
    await this.#database
      .insertInto('tickets')
      .values({ ...row, lineItems: JSON.stringify(row.lineItems), version: 1 })
      .execute()
      .catch((error: unknown) => {
        throw ConcurrencyConflictError.fromUniqueViolation(
          error,
          `ticket ${row.ticketId} or a ticket for order ${row.orderId} already exists`,
        );
      });
  }

  async #update(row: TicketRow): Promise<void> {
    const { ticketId, version, lineItems, ...columns } = row;
    const result = await this.#database
      .updateTable('tickets')
      .set({ ...columns, lineItems: JSON.stringify(lineItems), version: version + 1 })
      .where('ticketId', '=', ticketId)
      .where('version', '=', version)
      .executeTakeFirst();
    if (result.numUpdatedRows === 0n) {
      throw new ConcurrencyConflictError(
        `ticket ${ticketId} changed after version ${String(version)}`,
      );
    }
  }
}
