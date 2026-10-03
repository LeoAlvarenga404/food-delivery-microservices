import { left, right } from '@fd/domain';
import { describe, expect, it } from 'vitest';
import { parsePaymentId } from './payment-id.value-object.ts';

describe('parsePaymentId', () => {
  it('accepts a UUID', () => {
    expect(parsePaymentId('0199a5d0-0000-7000-8000-0000000000e9')).toEqual(
      right('0199a5d0-0000-7000-8000-0000000000e9'),
    );
  });

  it('returns the canonical lowercase form', () => {
    expect(parsePaymentId('0199A5D0-0000-7000-8000-0000000000E9')).toEqual(
      right('0199a5d0-0000-7000-8000-0000000000e9'),
    );
  });

  it.each([
    '',
    'payment-1',
    '0199a5d0-0000-7000-8000',
    'x0199a5d0-0000-7000-8000-0000000000e9',
    '0199a5d0-0000-7000-8000-0000000000e9x',
  ])('rejects "%s"', (rawPaymentId) => {
    expect(parsePaymentId(rawPaymentId)).toEqual(left({ type: 'InvalidPaymentId', rawPaymentId }));
  });
});
