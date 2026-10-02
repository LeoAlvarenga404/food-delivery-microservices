import { describe, expect, it } from 'vitest';
import { parseRestaurantId } from '#domain/menu/restaurant-id.value-object.ts';
import type { RestaurantMenuRepository } from '#domain/menu/restaurant-menu.repository.ts';
import type { RestaurantMenu } from '#domain/menu/restaurant-menu.value-object.ts';
import { pizzeriaMenu, unwrap } from './order.builder.ts';

function describeItems(menu: RestaurantMenu | undefined): readonly object[] | undefined {
  return menu?.items.map((item) => ({
    menuItemId: item.menuItemId,
    name: item.name,
    price: item.price.toSnapshot(),
  }));
}

export function describeRestaurantMenuRepositoryContract(
  implementationName: string,
  createRepository: () => RestaurantMenuRepository,
): void {
  describe(`${implementationName} restaurant menu repository`, () => {
    it('finds the menu replica of the seeded pizzeria', async () => {
      const menu = await createRepository().findByRestaurantId(pizzeriaMenu.restaurantId);

      expect(menu?.restaurantId).toBe(pizzeriaMenu.restaurantId);
      expect(describeItems(menu)).toEqual(describeItems(pizzeriaMenu));
    });

    it('returns undefined for a restaurant without a menu replica', async () => {
      const unknownRestaurantId = unwrap(parseRestaurantId('0199a5d0-0000-7000-8000-0000000000ff'));

      expect(await createRepository().findByRestaurantId(unknownRestaurantId)).toBeUndefined();
    });
  });
}
