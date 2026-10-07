import { left, right } from '@fd/domain';
import { describe, expect, it } from 'vitest';
import { parseRestaurantId } from './restaurant-id.value-object.ts';

describe('parseRestaurantId', () => {
  it('accepts a UUID', () => {
    expect(parseRestaurantId('0199a5d0-0000-7000-8000-000000000001')).toEqual(
      right('0199a5d0-0000-7000-8000-000000000001'),
    );
  });

  it('returns the canonical lowercase form', () => {
    expect(parseRestaurantId('0199A5D0-0000-7000-8000-000000000001')).toEqual(
      right('0199a5d0-0000-7000-8000-000000000001'),
    );
  });

  it.each([
    '',
    'ana',
    '0199a5d0-0000-7000-8000',
    'x0199a5d0-0000-7000-8000-000000000001',
    '0199a5d0-0000-7000-8000-000000000001x',
  ])('rejects "%s"', (rawRestaurantId) => {
    expect(parseRestaurantId(rawRestaurantId)).toEqual(
      left({ type: 'InvalidRestaurantId', rawRestaurantId }),
    );
  });
});
