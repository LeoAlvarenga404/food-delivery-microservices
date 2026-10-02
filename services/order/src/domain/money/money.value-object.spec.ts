import { describe, expect, it } from 'vitest';
import { Money } from './money.value-object.ts';

describe('Money', () => {
  it('adds amounts of the same currency', () => {
    const total = Money.of(4500n, 'BRL').add(Money.of(800n, 'BRL'));

    expect(total.toSnapshot()).toEqual({ amountInCents: 5300n, currency: 'BRL' });
  });

  it('multiplies an amount by a quantity', () => {
    expect(Money.of(4500n, 'BRL').multiply(3).toSnapshot()).toEqual({
      amountInCents: 13500n,
      currency: 'BRL',
    });
  });

  it('starts sums from zero', () => {
    expect(Money.zero('BRL').equals(Money.of(0n, 'BRL'))).toBe(true);
  });

  it('compares by amount, not by instance', () => {
    expect(Money.of(4500n, 'BRL').equals(Money.of(4500n, 'BRL'))).toBe(true);
    expect(Money.of(4500n, 'BRL').equals(Money.of(4501n, 'BRL'))).toBe(false);
  });
});
