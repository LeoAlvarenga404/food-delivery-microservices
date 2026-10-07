import { left, right } from '@fd/domain';
import { describe, expect, it } from 'vitest';
import { parseMoney } from './money.value-object.ts';

describe('parseMoney', () => {
  it('accepts an exact amount in cents beyond the safe integer range', () => {
    expect(parseMoney(9_007_199_254_740_993n, 'BRL')).toEqual(
      right({ amountInCents: 9_007_199_254_740_993n, currency: 'BRL' }),
    );
  });

  it('accepts nothing to pay, as a free delivery', () => {
    expect(parseMoney(0n, 'BRL')).toEqual(right({ amountInCents: 0n, currency: 'BRL' }));
  });

  it.each([
    { amountInCents: -1n, currency: 'BRL' },
    { amountInCents: 9800n, currency: 'USD' },
    { amountInCents: 9800n, currency: '' },
  ])('rejects $amountInCents cents in "$currency"', ({ amountInCents, currency }) => {
    expect(parseMoney(amountInCents, currency)).toEqual(
      left({ type: 'InvalidMoney', amountInCents, currency }),
    );
  });
});
