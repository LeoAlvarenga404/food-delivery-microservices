import type { Selectable } from 'kysely';
import type { MenuItemId } from '#domain/menu/menu-item-id.value-object.ts';
import type { RestaurantId } from '#domain/menu/restaurant-id.value-object.ts';
import type { RestaurantMenu } from '#domain/menu/restaurant-menu.value-object.ts';
import { Money, type Currency } from '#domain/money/money.value-object.ts';
import type { MenuItems } from './generated/database.ts';

export type MenuItemRow = Selectable<MenuItems>;

export const restaurantMenuPersistenceMapper = {
  toDomain(restaurantId: RestaurantId, rows: readonly MenuItemRow[]): RestaurantMenu {
    return {
      restaurantId,
      items: rows.map((row) => ({
        menuItemId: row.menuItemId as MenuItemId,
        name: row.name,
        price: Money.of(row.priceInCents, row.currency as Currency),
      })),
    };
  },

  toPersistence(menu: RestaurantMenu): readonly MenuItemRow[] {
    return menu.items.map((item) => {
      const { amountInCents, currency } = item.price.toSnapshot();
      return {
        restaurantId: menu.restaurantId,
        menuItemId: item.menuItemId,
        name: item.name,
        priceInCents: amountInCents,
        currency,
      };
    });
  },
};
