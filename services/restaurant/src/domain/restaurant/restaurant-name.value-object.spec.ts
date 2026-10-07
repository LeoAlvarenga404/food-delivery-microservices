import { left, right } from '@fd/domain';
import { describe, expect, it } from 'vitest';
import { parseRestaurantName } from './restaurant-name.value-object.ts';

describe('parseRestaurantName', () => {
  it('accepts a name and trims the spaces around it', () => {
    expect(parseRestaurantName('  Pizzaria Bella ')).toEqual(right('Pizzaria Bella'));
  });

  it.each([1, 100])('accepts a name of %i characters', (length) => {
    expect(parseRestaurantName('a'.repeat(length))).toEqual(right('a'.repeat(length)));
  });

  it.each([
    { scenario: 'an empty name', rawName: '' },
    { scenario: 'a name made of spaces', rawName: '   ' },
    { scenario: 'a name longer than one hundred characters', rawName: 'a'.repeat(101) },
    { scenario: 'a name with a control character', rawName: 'Pizzaria\u0000Bella' },
  ])('refuses $scenario', ({ rawName }) => {
    expect(parseRestaurantName(rawName)).toEqual(left({ type: 'InvalidRestaurantName' }));
  });
});
