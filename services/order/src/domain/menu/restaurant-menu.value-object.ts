import type { MenuItemId } from './menu-item-id.value-object.ts';
import type { RestaurantId } from './restaurant-id.value-object.ts';
import type { Money } from '#domain/money/money.value-object.ts';

export interface MenuItem {
  readonly menuItemId: MenuItemId;
  readonly name: string;
  readonly price: Money;
}

export interface RestaurantMenu {
  readonly restaurantId: RestaurantId;
  readonly items: readonly MenuItem[];
}
