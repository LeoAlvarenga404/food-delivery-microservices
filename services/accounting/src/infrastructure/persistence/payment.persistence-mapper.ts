import type { Selectable } from 'kysely';
import type { ConsumerId } from '#domain/payment/consumer-id.value-object.ts';
import type { GatewayAuthorizationId } from '#domain/payment/gateway-authorization-id.value-object.ts';
import type { GatewayVoidId } from '#domain/payment/gateway-void-id.value-object.ts';
import type { Currency } from '#domain/payment/money.value-object.ts';
import type { OrderId } from '#domain/payment/order-id.value-object.ts';
import type { PaymentId } from '#domain/payment/payment-id.value-object.ts';
import { Payment, type PaymentState } from '#domain/payment/payment.aggregate.ts';
import type { RestaurantId } from '#domain/payment/restaurant-id.value-object.ts';
import type { Payments } from './generated/database.ts';

export type PaymentRow = Selectable<Payments>;

function toPaymentState({ status, voidedAt, gatewayVoidId }: PaymentRow): PaymentState {
  if (status !== 'VOIDED' || voidedAt === null || gatewayVoidId === null) {
    return { status: 'AUTHORIZED' };
  }
  return { status, voidedAt, gatewayVoidId: gatewayVoidId as GatewayVoidId };
}

function toVoidColumns(state: PaymentState): Pick<PaymentRow, 'voidedAt' | 'gatewayVoidId'> {
  if (state.status === 'AUTHORIZED') return { voidedAt: null, gatewayVoidId: null };
  return { voidedAt: state.voidedAt, gatewayVoidId: state.gatewayVoidId };
}

export const paymentPersistenceMapper = {
  toDomain(row: PaymentRow): Payment {
    const currency = row.currency as Currency;
    return Payment.restore({
      paymentId: row.paymentId as PaymentId,
      orderId: row.orderId as OrderId,
      consumerId: row.consumerId as ConsumerId,
      restaurantId: row.restaurantId as RestaurantId,
      amount: { amountInCents: row.amountInCents, currency },
      deliveryFee: { amountInCents: row.deliveryFeeInCents, currency },
      gatewayAuthorizationId: row.gatewayAuthorizationId as GatewayAuthorizationId,
      authorizedAt: row.authorizedAt,
      state: toPaymentState(row),
      version: row.version,
    });
  },

  toPersistence(payment: Payment): PaymentRow {
    const snapshot = payment.toSnapshot();
    return {
      paymentId: snapshot.paymentId,
      orderId: snapshot.orderId,
      consumerId: snapshot.consumerId,
      restaurantId: snapshot.restaurantId,
      amountInCents: snapshot.amount.amountInCents,
      deliveryFeeInCents: snapshot.deliveryFee.amountInCents,
      currency: snapshot.amount.currency,
      gatewayAuthorizationId: snapshot.gatewayAuthorizationId,
      authorizedAt: snapshot.authorizedAt,
      status: snapshot.state.status,
      ...toVoidColumns(snapshot.state),
      version: snapshot.version,
    };
  },
};
