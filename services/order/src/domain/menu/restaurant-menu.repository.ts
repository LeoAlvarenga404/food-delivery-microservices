import type { RestaurantId } from './restaurant-id.value-object.ts';
import type { RestaurantMenu } from './restaurant-menu.value-object.ts';

export interface RestaurantMenuRepository {
  findByRestaurantId(restaurantId: RestaurantId): Promise<RestaurantMenu | undefined>;
}
