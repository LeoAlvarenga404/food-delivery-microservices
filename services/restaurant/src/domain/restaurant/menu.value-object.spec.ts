import { left, right } from '@fd/domain';
import { describe, expect, it } from 'vitest';
import { emptyMenu, parseMenu } from './menu.value-object.ts';

function menuItem(sequenceNumber: number): {
  readonly menuItemId: string;
  readonly name: string;
  readonly priceInCents: bigint;
  readonly isAvailable: boolean;
} {
  return {
    menuItemId: `0199a5d0-0000-7000-8000-${sequenceNumber.toString(16).padStart(12, '0')}`,
    name: `Item ${String(sequenceNumber)}`,
    priceInCents: 1000n,
    isAvailable: true,
  };
}

describe('parseMenu', () => {
  it('accepts the items of a menu in their order', () => {
    const items = [menuItem(2), menuItem(1)];

    expect(parseMenu(items)).toEqual(right(items));
  });

  it('accepts an empty menu', () => {
    expect(parseMenu([])).toEqual(right(emptyMenu));
  });

  it('accepts a menu of two hundred items', () => {
    const items = Array.from({ length: 200 }, (unused, index) => menuItem(index + 1));

    expect(parseMenu(items)).toEqual(right(items));
  });

  it('refuses a menu of more than two hundred items', () => {
    const items = Array.from({ length: 201 }, (unused, index) => menuItem(index + 1));

    expect(parseMenu(items)).toEqual(left({ type: 'InvalidMenuItemCount', menuItemCount: 201 }));
  });

  it('refuses a menu that lists the same item twice, whatever the case of its id', () => {
    const repeated = { ...menuItem(1), menuItemId: menuItem(1).menuItemId.toUpperCase() };

    expect(parseMenu([menuItem(1), menuItem(2), repeated])).toEqual(
      left({ type: 'DuplicateMenuItem', menuItemId: menuItem(1).menuItemId }),
    );
  });

  it('refuses a menu with an invalid item', () => {
    expect(parseMenu([menuItem(1), { ...menuItem(2), priceInCents: 0n }])).toEqual(
      left({ type: 'InvalidMenuItem', field: 'priceInCents' }),
    );
  });
});
