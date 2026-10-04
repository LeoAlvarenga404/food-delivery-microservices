import type { RestaurantId } from '#domain/menu/restaurant-id.value-object.ts';
import type { RestaurantMenu } from '#domain/menu/restaurant-menu.value-object.ts';

export interface ApplyMenuRevisionCommand {
  readonly menu: RestaurantMenu;
}

export interface StaleMenuRevision {
  readonly type: 'StaleMenuRevision';
  readonly restaurantId: RestaurantId;
  readonly version: number;
}
