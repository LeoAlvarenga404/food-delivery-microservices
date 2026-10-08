import { left, right } from '@fd/domain';
import { describe, expect, it } from 'vitest';
import {
  authorizePaymentInput,
  buildPayment,
  gatewayVoidId,
  unwrap,
} from '../../../test/support/payment.builder.ts';
import { parseGatewayVoidId } from './gateway-void-id.value-object.ts';
import { Payment } from './payment.aggregate.ts';

const voidedAt = new Date('2026-10-02T12:01:30.000Z');

describe('Payment', () => {
  it('records an authorization the gateway granted, with the restaurant and the delivery fee in cents', () => {
    expect(buildPayment().toSnapshot()).toEqual({
      ...authorizePaymentInput(),
      restaurantId: '0199a5d0-0000-7000-8000-000000000001',
      amount: { amountInCents: 9800n, currency: 'BRL' },
      deliveryFee: { amountInCents: 800n, currency: 'BRL' },
      state: { status: 'AUTHORIZED' },
      version: 0,
    });
  });

  it('restores the snapshot it was given', () => {
    const snapshot = { ...buildPayment().toSnapshot(), version: 1 };

    expect(Payment.restore(snapshot).toSnapshot()).toEqual(snapshot);
  });

  it('voids an authorized payment with the time and the reference of the gateway void', () => {
    const payment = buildPayment();

    expect(payment.void({ voidedAt, gatewayVoidId })).toEqual(right(undefined));
    expect(payment.toSnapshot()).toEqual({
      ...buildPayment().toSnapshot(),
      state: { status: 'VOIDED', voidedAt, gatewayVoidId },
    });
  });

  it('refuses to void a voided payment again and keeps the first void', () => {
    const payment = buildPayment();
    unwrap(payment.void({ voidedAt, gatewayVoidId }));
    const otherVoidId = unwrap(parseGatewayVoidId('0199a5d0-0000-7000-8000-000000000a98'));

    const voidedAgain = payment.void({
      voidedAt: new Date('2026-10-02T12:05:00.000Z'),
      gatewayVoidId: otherVoidId,
    });

    expect(voidedAgain).toEqual(
      left({ type: 'PaymentAlreadyVoided', paymentId: payment.toSnapshot().paymentId }),
    );
    expect(payment.toSnapshot().state).toEqual({ status: 'VOIDED', voidedAt, gatewayVoidId });
  });

  it('restores a voided payment with its void', () => {
    const payment = buildPayment();
    unwrap(payment.void({ voidedAt, gatewayVoidId }));
    const snapshot = { ...payment.toSnapshot(), version: 2 };

    expect(Payment.restore(snapshot).toSnapshot()).toEqual(snapshot);
  });
});
