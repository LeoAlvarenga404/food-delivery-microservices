import { left, right } from '@fd/domain';
import { describe, expect, it } from 'vitest';
import { parseRestaurantId } from './restaurant-id.value-object.ts';

describe('parseRestaurantId', () => {
  it('accepts a UUID', () => {
    expect(parseRestaurantId('0199a5d0-0000-7000-8000-0000000000a1').isRight()).toBe(true);
  });

  it('returns the canonical lowercase form', () => {
    expect(parseRestaurantId('0199A5D0-0000-7000-8000-0000000000A1')).toEqual(
      right('0199a5d0-0000-7000-8000-0000000000a1'),
    );
  });

  it.each(['', 'x-1', '0199a5d0-0000-7000-8000'])('rejects "%s"', (rawRestaurantId) => {
    expect(parseRestaurantId(rawRestaurantId)).toEqual(
      left({ type: 'InvalidRestaurantId', rawRestaurantId }),
    );
  });
});
