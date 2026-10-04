import type { RestaurantId } from '#domain/restaurant/restaurant-id.value-object.ts';

export interface IdGenerator {
  generateRestaurantId(): RestaurantId;
}
