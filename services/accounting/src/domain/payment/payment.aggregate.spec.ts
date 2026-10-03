import { describe, expect, it } from 'vitest';
import { authorizePaymentInput, buildPayment } from '../../../test/support/payment.builder.ts';
import { Payment } from './payment.aggregate.ts';

describe('Payment', () => {
  it('records an authorization the gateway granted, in cents', () => {
    expect(buildPayment().toSnapshot()).toEqual({
      ...authorizePaymentInput(),
      status: 'AUTHORIZED',
      version: 0,
    });
  });

  it('restores the snapshot it was given', () => {
    const snapshot = { ...buildPayment().toSnapshot(), version: 1 };

    expect(Payment.restore(snapshot).toSnapshot()).toEqual(snapshot);
  });
});
