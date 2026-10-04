import { left, right } from '@fd/domain';
import { describe, expect, it } from 'vitest';
import { parseAddress, type Address } from './address.value-object.ts';

const home: Address = {
  street: 'Rua Augusta',
  number: '1500',
  city: 'Sao Paulo',
  postalCode: '01304-001',
};

describe('parseAddress', () => {
  it('accepts a complete address and trims every field', () => {
    expect(
      parseAddress({
        street: ' Rua Augusta ',
        number: ' 1500',
        city: 'Sao Paulo ',
        postalCode: ' 01304-001 ',
      }),
    ).toEqual(right(home));
  });

  it('accepts fields of exactly one hundred characters', () => {
    const longest = 'a'.repeat(100);
    const address = { street: longest, number: longest, city: longest, postalCode: longest };

    expect(parseAddress(address)).toEqual(right(address));
  });

  it.each([
    { field: 'street', address: { ...home, street: ' ' } },
    { field: 'number', address: { ...home, number: '' } },
    { field: 'city', address: { ...home, city: 'a'.repeat(101) } },
    { field: 'postalCode', address: { ...home, postalCode: '' } },
  ])('refuses an address with an empty or too long $field', ({ field, address }) => {
    expect(parseAddress(address)).toEqual(left({ type: 'InvalidAddress', field }));
  });
});
