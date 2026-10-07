import { left, right } from '@fd/domain';
import { describe, expect, it } from 'vitest';
import { parseMenuItem } from './menu-item.value-object.ts';

const margherita = {
  menuItemId: '0199a5d0-0000-7000-8000-000000000d01',
  name: 'Margherita',
  priceInCents: 4500n,
  isAvailable: true,
};

describe('parseMenuItem', () => {
  it('accepts an item, lowercases its id and trims its name', () => {
    expect(
      parseMenuItem({
        ...margherita,
        menuItemId: margherita.menuItemId.toUpperCase(),
        name: ' Margherita ',
      }),
    ).toEqual(right(margherita));
  });

  it('keeps an item that is not available', () => {
    expect(parseMenuItem({ ...margherita, isAvailable: false })).toEqual(
      right({ ...margherita, isAvailable: false }),
    );
  });

  it.each([1n, 10_000_000n])('accepts a price of %i cents', (priceInCents) => {
    expect(parseMenuItem({ ...margherita, priceInCents })).toEqual(
      right({ ...margherita, priceInCents }),
    );
  });

  it.each([
    { field: 'menuItemId', item: { ...margherita, menuItemId: 'margherita' } },
    { field: 'name', item: { ...margherita, name: ' ' } },
    { field: 'name', item: { ...margherita, name: 'a'.repeat(101) } },
    { field: 'name', item: { ...margherita, name: 'Marg\u0000herita' } },
    { field: 'priceInCents', item: { ...margherita, priceInCents: 0n } },
    { field: 'priceInCents', item: { ...margherita, priceInCents: 10_000_001n } },
  ])('refuses an item with an invalid $field', ({ field, item }) => {
    expect(parseMenuItem(item)).toEqual(left({ type: 'InvalidMenuItem', field }));
  });
});
