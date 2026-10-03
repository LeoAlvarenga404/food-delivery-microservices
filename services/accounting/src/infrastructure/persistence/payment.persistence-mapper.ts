import type { Selectable } from 'kysely';
import type { OrderId } from '#domain/payment/order-id.value-object.ts';
import type { PaymentId } from '#domain/payment/payment-id.value-object.ts';
import { Payment, type Currency, type PaymentStatus } from '#domain/payment/payment.aggregate.ts';
import type { Payments } from './generated/database.ts';

export type PaymentRow = Selectable<Payments>;

export const paymentPersistenceMapper = {
  toDomain(row: PaymentRow): Payment {
    return Payment.restore({
      paymentId: row.paymentId as PaymentId,
      orderId: row.orderId as OrderId,
      consumerId: row.consumerId,
      amountInCents: row.amountInCents,
      currency: row.currency as Currency,
      gatewayAuthorizationId: row.gatewayAuthorizationId,
      authorizedAt: row.authorizedAt,
      status: row.status as PaymentStatus,
      version: row.version,
    });
  },

  toPersistence(payment: Payment): PaymentRow {
    const snapshot = payment.toSnapshot();
    return {
      paymentId: snapshot.paymentId,
      orderId: snapshot.orderId,
      consumerId: snapshot.consumerId,
      amountInCents: snapshot.amountInCents,
      currency: snapshot.currency,
      gatewayAuthorizationId: snapshot.gatewayAuthorizationId,
      authorizedAt: snapshot.authorizedAt,
      status: snapshot.status,
      version: snapshot.version,
    };
  },
};
