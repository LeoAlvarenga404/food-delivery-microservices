import type { Either } from '@fd/domain';
import { parseConsumerId, type ConsumerId } from '#domain/payment/consumer-id.value-object.ts';
import { parseGatewayAuthorizationId } from '#domain/payment/gateway-authorization-id.value-object.ts';
import {
  parseGatewayVoidId,
  type GatewayVoidId,
} from '#domain/payment/gateway-void-id.value-object.ts';
import { parseOrderId, type OrderId } from '#domain/payment/order-id.value-object.ts';
import { parsePaymentId, type PaymentId } from '#domain/payment/payment-id.value-object.ts';
import { Payment, type AuthorizePaymentInput } from '#domain/payment/payment.aggregate.ts';
import {
  parseRestaurantId,
  type RestaurantId,
} from '#domain/payment/restaurant-id.value-object.ts';

export function unwrap<Success>(either: Either<unknown, Success>): Success {
  if (either.isLeft()) throw new Error(`expected a right, got ${JSON.stringify(either.failure)}`);
  return either.success;
}

export const paymentId: PaymentId = unwrap(parsePaymentId('0199a5d0-0000-7000-8000-0000000000e9'));
export const orderId: OrderId = unwrap(parseOrderId('0199a5d0-0000-7000-8000-0000000000a1'));
export const consumerId: ConsumerId = unwrap(
  parseConsumerId('0199a5d0-0000-7000-8000-0000000000c1'),
);
export const restaurantId: RestaurantId = unwrap(
  parseRestaurantId('0199a5d0-0000-7000-8000-000000000001'),
);
export const gatewayVoidId: GatewayVoidId = unwrap(
  parseGatewayVoidId('0199a5d0-0000-7000-8000-000000000a97'),
);

export function authorizePaymentInput(
  overrides: Partial<AuthorizePaymentInput> = {},
): AuthorizePaymentInput {
  return {
    paymentId,
    orderId,
    consumerId,
    restaurantId,
    amount: { amountInCents: 9800n, currency: 'BRL' },
    deliveryFee: { amountInCents: 800n, currency: 'BRL' },
    gatewayAuthorizationId: unwrap(
      parseGatewayAuthorizationId('0199a5d0-0000-7000-8000-000000000a99'),
    ),
    authorizedAt: new Date('2026-10-02T12:00:03.000Z'),
    ...overrides,
  };
}

export function buildPayment(overrides: Partial<AuthorizePaymentInput> = {}): Payment {
  return Payment.authorize(authorizePaymentInput(overrides));
}
