import { left, right } from '@fd/domain';
import { describe, expect, it } from 'vitest';
import { parseRestaurantMenu, type RawRestaurantMenu } from './restaurant-menu.value-object.ts';

const rawMenu: RawRestaurantMenu = {
  restaurantId: '0199A5D0-0000-7000-8000-0000000000B1',
  version: 4,
  openingHours: {
    timeZone: 'America/Sao_Paulo',
    periods: [{ dayOfWeek: 'SATURDAY', opensAt: '18:00', closesAt: '02:00' }],
  },
  minimumOrderInCents: 2000n,
  items: [
    {
      menuItemId: '0199A5D0-0000-7000-8000-000000000D02',
      name: 'Guarana',
      priceInCents: 800n,
      isAvailable: false,
    },
    {
      menuItemId: '0199a5d0-0000-7000-8000-000000000d01',
      name: 'Margherita',
      priceInCents: 4500n,
      isAvailable: true,
    },
  ],
};

function withItem(item: Partial<RawRestaurantMenu['items'][number]>): RawRestaurantMenu {
  const [guarana, margherita] = rawMenu.items;
  if (guarana === undefined || margherita === undefined) throw new Error('expected two items');
  return { ...rawMenu, items: [{ ...guarana, ...item }, margherita] };
}

describe('parseRestaurantMenu', () => {
  it('keeps the snapshot of the menu with canonical ids and the items in their order', () => {
    expect(parseRestaurantMenu(rawMenu)).toEqual(
      right({
        ...rawMenu,
        restaurantId: '0199a5d0-0000-7000-8000-0000000000b1',
        items: [
          { ...rawMenu.items[0], menuItemId: '0199a5d0-0000-7000-8000-000000000d02' },
          rawMenu.items[1],
        ],
      }),
    );
  });

  it('accepts an empty menu and a minimum order of zero', () => {
    expect(parseRestaurantMenu({ ...rawMenu, items: [], minimumOrderInCents: 0n }).isRight()).toBe(
      true,
    );
  });

  it.each<{ readonly field: string; readonly invalidMenu: RawRestaurantMenu }>([
    { field: 'restaurantId', invalidMenu: { ...rawMenu, restaurantId: 'pizzeria' } },
    { field: 'version', invalidMenu: { ...rawMenu, version: 0 } },
    { field: 'version', invalidMenu: { ...rawMenu, version: 1.5 } },
    { field: 'minimumOrderInCents', invalidMenu: { ...rawMenu, minimumOrderInCents: -1n } },
    { field: 'menuItemId', invalidMenu: withItem({ menuItemId: 'guarana' }) },
    { field: 'name', invalidMenu: withItem({ name: '  ' }) },
    { field: 'name', invalidMenu: withItem({ name: 'Guarana\u0007' }) },
    { field: 'priceInCents', invalidMenu: withItem({ priceInCents: 0n }) },
  ])('refuses a menu with an invalid $field', ({ field, invalidMenu }) => {
    expect(parseRestaurantMenu(invalidMenu)).toEqual(
      left({ type: 'InvalidRestaurantMenu', field }),
    );
  });

  it('refuses a menu whose opening hours are invalid', () => {
    const invalidMenu = {
      ...rawMenu,
      openingHours: { ...rawMenu.openingHours, timeZone: 'Mars/Olympus' },
    };

    expect(parseRestaurantMenu(invalidMenu)).toEqual(
      left({ type: 'InvalidOpeningHours', field: 'timeZone' }),
    );
  });
});
