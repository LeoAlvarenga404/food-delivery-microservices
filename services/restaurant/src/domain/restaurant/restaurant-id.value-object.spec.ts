import { left, right } from '@fd/domain';
import { describe, expect, it } from 'vitest';
import { parseRestaurantId } from './restaurant-id.value-object.ts';

describe('parseRestaurantId', () => {
  it('returns a restaurant id in canonical lowercase form', () => {
    expect(parseRestaurantId('0199A5D0-0000-7000-8000-0000000000B1')).toEqual(
      right('0199a5d0-0000-7000-8000-0000000000b1'),
    );
  });

  it.each(['restaurant-1', '', '0199a5d0-0000-7000-8000-0000000000b1 '])(
    'refuses %j, which is not a uuid',
    (rawRestaurantId) => {
      expect(parseRestaurantId(rawRestaurantId)).toEqual(
        left({ type: 'InvalidRestaurantId', rawRestaurantId }),
      );
    },
  );
});
