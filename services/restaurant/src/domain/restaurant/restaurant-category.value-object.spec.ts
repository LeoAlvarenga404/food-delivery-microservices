import { left, right } from '@fd/domain';
import { describe, expect, it } from 'vitest';
import { parseRestaurantCategory } from './restaurant-category.value-object.ts';

describe('parseRestaurantCategory', () => {
  it('accepts a category and trims the spaces around it', () => {
    expect(parseRestaurantCategory(' Pizza ')).toEqual(right('Pizza'));
  });

  it.each([1, 50])('accepts a category of %i characters', (length) => {
    expect(parseRestaurantCategory('a'.repeat(length))).toEqual(right('a'.repeat(length)));
  });

  it.each([
    { scenario: 'an empty category', rawCategory: ' ' },
    { scenario: 'a category longer than fifty characters', rawCategory: 'a'.repeat(51) },
    { scenario: 'a category with a control character', rawCategory: 'Piz\u0007za' },
  ])('refuses $scenario', ({ rawCategory }) => {
    expect(parseRestaurantCategory(rawCategory)).toEqual(
      left({ type: 'InvalidRestaurantCategory' }),
    );
  });
});
