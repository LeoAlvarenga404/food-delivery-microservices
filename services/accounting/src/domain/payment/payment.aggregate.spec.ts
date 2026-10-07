import { describe, expect, it } from 'vitest';
import { authorizePaymentInput, buildPayment } from '../../../test/support/payment.builder.ts';
import { Payment } from './payment.aggregate.ts';

describe('Payment', () => {
  it('records an authorization the gateway granted, with the restaurant and the delivery fee in cents', () => {
    expect(buildPayment().toSnapshot()).toEqual({
      ...authorizePaymentInput(),
      restaurantId: '0199a5d0-0000-7000-8000-000000000001',
      amount: { amountInCents: 9800n, currency: 'BRL' },
      deliveryFee: { amountInCents: 800n, currency: 'BRL' },
      status: 'AUTHORIZED',
      version: 0,
    });
  });

  it('restores the snapshot it was given', () => {
    const snapshot = { ...buildPayment().toSnapshot(), version: 1 };

    expect(Payment.restore(snapshot).toSnapshot()).toEqual(snapshot);
  });
});
