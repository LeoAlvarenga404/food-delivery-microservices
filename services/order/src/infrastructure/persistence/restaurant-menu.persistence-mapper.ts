import type { Selectable } from 'kysely';
import type { MenuItemId } from '#domain/menu/menu-item-id.value-object.ts';
import type { OpeningHours } from '#domain/menu/opening-hours.value-object.ts';
import type { RestaurantId } from '#domain/menu/restaurant-id.value-object.ts';
import type { RestaurantMenu } from '#domain/menu/restaurant-menu.value-object.ts';
import type { RestaurantMenus } from './generated/database.ts';

export type RestaurantMenuRow = Selectable<RestaurantMenus>;

interface MenuItemDocument {
  readonly menuItemId: string;
  readonly name: string;
  readonly priceInCents: string;
  readonly isAvailable: boolean;
}

export const restaurantMenuPersistenceMapper = {
  toDomain(row: RestaurantMenuRow): RestaurantMenu {
    const menuItems = row.menuItems as unknown as readonly MenuItemDocument[];
    return {
      restaurantId: row.restaurantId as RestaurantId,
      version: row.version,
      openingHours: {
        timeZone: row.timeZone,
        periods: row.openingHours,
      } as unknown as OpeningHours,
      minimumOrderInCents: row.minimumOrderInCents,
      items: menuItems.map((item) => ({
        menuItemId: item.menuItemId as MenuItemId,
        name: item.name,
        priceInCents: BigInt(item.priceInCents),
        isAvailable: item.isAvailable,
      })),
    };
  },

  toPersistence(menu: RestaurantMenu): RestaurantMenuRow {
    const { timeZone, periods } = menu.openingHours;
    return {
      restaurantId: menu.restaurantId,
      version: menu.version,
      timeZone,
      openingHours: periods.map(({ dayOfWeek, opensAt, closesAt }) => ({
        dayOfWeek,
        opensAt,
        closesAt,
      })),
      minimumOrderInCents: menu.minimumOrderInCents,
      menuItems: menu.items.map((item) => ({
        menuItemId: item.menuItemId,
        name: item.name,
        priceInCents: String(item.priceInCents),
        isAvailable: item.isAvailable,
      })),
    };
  },
};
