import { ConcurrencyConflictError } from '@fd/chassis-postgres';
import type { Kysely } from 'kysely';
import type { OrderId } from '#domain/payment/order-id.value-object.ts';
import type { Payment } from '#domain/payment/payment.aggregate.ts';
import type { PaymentRepository } from '#domain/payment/payment.repository.ts';
import type { DB as AccountingDatabase } from './generated/database.ts';
import { paymentPersistenceMapper, type PaymentRow } from './payment.persistence-mapper.ts';

export class PostgresPaymentRepository implements PaymentRepository {
  readonly #database: Kysely<AccountingDatabase>;

  constructor(database: Kysely<AccountingDatabase>) {
    this.#database = database;
  }

  async findByOrderId(orderId: OrderId): Promise<Payment | undefined> {
    const row = await this.#database
      .selectFrom('payments')
      .selectAll()
      .where('orderId', '=', orderId)
      .executeTakeFirst();
    return row === undefined ? undefined : paymentPersistenceMapper.toDomain(row);
  }

  async save(payment: Payment): Promise<void> {
    const row = paymentPersistenceMapper.toPersistence(payment);
    if (row.version === 0) {
      await this.#insert(row);
      return;
    }
    await this.#update(row);
  }

  async #insert(row: PaymentRow): Promise<void> {
    await this.#database
      .insertInto('payments')
      .values({ ...row, version: row.version + 1 })
      .execute()
      .catch((error: unknown) => {
        throw ConcurrencyConflictError.fromUniqueViolation(
          error,
          `payment ${row.paymentId} or a payment for order ${row.orderId} already exists`,
        );
      });
  }

  async #update(row: PaymentRow): Promise<void> {
    const result = await this.#database
      .updateTable('payments')
      .set({ ...row, version: row.version + 1 })
      .where('paymentId', '=', row.paymentId)
      .where('version', '=', row.version)
      .executeTakeFirst();
    if (result.numUpdatedRows === 0n) {
      throw new ConcurrencyConflictError(
        `payment ${row.paymentId} changed after version ${String(row.version)}`,
      );
    }
  }
}
