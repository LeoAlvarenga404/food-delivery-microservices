import type { Either } from '@fd/domain';
import { parseOrderId, type OrderId } from '#domain/payment/order-id.value-object.ts';
import { parsePaymentId, type PaymentId } from '#domain/payment/payment-id.value-object.ts';
import { Payment, type AuthorizePaymentInput } from '#domain/payment/payment.aggregate.ts';

export function unwrap<Success>(either: Either<unknown, Success>): Success {
  if (either.isLeft()) throw new Error(`expected a right, got ${JSON.stringify(either.failure)}`);
  return either.success;
}

export const paymentId: PaymentId = unwrap(parsePaymentId('0199a5d0-0000-7000-8000-0000000000e9'));
export const orderId: OrderId = unwrap(parseOrderId('0199a5d0-0000-7000-8000-0000000000a1'));

export function authorizePaymentInput(
  overrides: Partial<AuthorizePaymentInput> = {},
): AuthorizePaymentInput {
  return {
    paymentId,
    orderId,
    consumerId: '0199a5d0-0000-7000-8000-0000000000c1',
    amountInCents: 9800n,
    currency: 'BRL',
    gatewayAuthorizationId: '0199a5d0-0000-7000-8000-000000000a99',
    authorizedAt: new Date('2026-10-02T12:00:03.000Z'),
    ...overrides,
  };
}

export function buildPayment(overrides: Partial<AuthorizePaymentInput> = {}): Payment {
  return Payment.authorize(authorizePaymentInput(overrides));
}
