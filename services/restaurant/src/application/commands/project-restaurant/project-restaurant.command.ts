import type { SearchableRestaurant } from '#application/ports/restaurant-search-index.port.ts';

export interface ProjectRestaurantCommand {
  readonly restaurant: SearchableRestaurant;
}

export interface StaleRestaurantProjection {
  readonly type: 'StaleRestaurantProjection';
  readonly restaurantId: string;
  readonly version: number;
}
