import type { Kysely } from 'kysely';
import type { OrderId } from '#domain/payment/order-id.value-object.ts';
import type { Payment } from '#domain/payment/payment.aggregate.ts';
import type { PaymentRepository } from '#domain/payment/payment.repository.ts';
import type { DB as AccountingDatabase } from './generated/database.ts';
import { paymentPersistenceMapper } from './payment.persistence-mapper.ts';

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
    await this.#database
      .insertInto('payments')
      .values({ ...row, version: row.version + 1 })
      .execute();
  }
}
