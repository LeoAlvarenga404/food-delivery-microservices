import { ConcurrencyConflictError } from '@fd/chassis-postgres';
import type { Kysely } from 'kysely';
import type { Order } from '#domain/order/order.aggregate.ts';
import type { OrderId } from '#domain/order/order-id.value-object.ts';
import type { OrderRepository } from '#domain/order/order.repository.ts';
import type { DB as OrderDatabase } from './generated/database.ts';
import { orderPersistenceMapper, type OrderRows } from './order.persistence-mapper.ts';

export class PostgresOrderRepository implements OrderRepository {
  readonly #database: Kysely<OrderDatabase>;

  constructor(database: Kysely<OrderDatabase>) {
    this.#database = database;
  }

  async findById(orderId: OrderId): Promise<Order | undefined> {
    const order = await this.#database
      .selectFrom('orders')
      .selectAll()
      .where('orderId', '=', orderId)
      .executeTakeFirst();
    if (order === undefined) return undefined;
    const lineItems = await this.#database
      .selectFrom('orderLineItems')
      .selectAll()
      .where('orderId', '=', orderId)
      .orderBy('lineNumber')
      .execute();
    return orderPersistenceMapper.toDomain({ order, lineItems });
  }

  async save(order: Order): Promise<void> {
    const snapshot = order.toSnapshot();
    const rows = orderPersistenceMapper.toPersistence(snapshot);
    if (snapshot.version === 0) {
      await this.#insert(rows);
      return;
    }
    await this.#update(rows, snapshot.version);
  }

  async #insert(rows: OrderRows): Promise<void> {
    await this.#database
      .insertInto('orders')
      .values({ ...rows.order, version: 1 })
      .execute()
      .catch((error: unknown) => {
        throw ConcurrencyConflictError.fromUniqueViolation(
          error,
          `order ${rows.order.orderId} already exists`,
        );
      });
    await this.#database.insertInto('orderLineItems').values(rows.lineItems).execute();
  }

  async #update(rows: OrderRows, expectedVersion: number): Promise<void> {
    const { orderId } = rows.order;
    const result = await this.#database
      .updateTable('orders')
      .set({ ...rows.order, version: expectedVersion + 1 })
      .where('orderId', '=', orderId)
      .where('version', '=', expectedVersion)
      .executeTakeFirst();
    if (result.numUpdatedRows === 0n) {
      throw new ConcurrencyConflictError(
        `order ${orderId} changed after version ${String(expectedVersion)}`,
      );
    }
  }
}
