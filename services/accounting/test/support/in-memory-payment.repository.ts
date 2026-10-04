import { ConcurrencyConflictError } from '@fd/chassis-postgres';
import type { OrderId } from '#domain/payment/order-id.value-object.ts';
import type { Payment } from '#domain/payment/payment.aggregate.ts';
import type { PaymentRepository } from '#domain/payment/payment.repository.ts';
import {
  paymentPersistenceMapper,
  type PaymentRow,
} from '#infrastructure/persistence/payment.persistence-mapper.ts';

export class InMemoryPaymentRepository implements PaymentRepository {
  readonly rows = new Map<string, PaymentRow>();

  findByOrderId(orderId: OrderId): Promise<Payment | undefined> {
    const row = this.rows.get(orderId);
    return Promise.resolve(row === undefined ? undefined : paymentPersistenceMapper.toDomain(row));
  }

  save(payment: Payment): Promise<void> {
    const row = paymentPersistenceMapper.toPersistence(payment);
    if (this.rows.has(row.orderId)) {
      return Promise.reject(
        new ConcurrencyConflictError(`order ${row.orderId} already has a payment`),
      );
    }
    if ([...this.rows.values()].some((stored) => stored.paymentId === row.paymentId)) {
      return Promise.reject(
        new ConcurrencyConflictError(`payment ${row.paymentId} already exists`),
      );
    }
    this.rows.set(row.orderId, { ...row, version: row.version + 1 });
    return Promise.resolve();
  }
}
