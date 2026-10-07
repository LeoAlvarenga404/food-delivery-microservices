import type { RestaurantSnapshot } from '#domain/restaurant/restaurant.aggregate.ts';
import type { RestaurantSearchCriteria } from '#domain/search/restaurant-search-criteria.value-object.ts';

export type SearchableRestaurant = Omit<RestaurantSnapshot, 'members'>;

export interface RestaurantSearch extends RestaurantSearchCriteria {
  readonly searchedAt: Date;
}

export interface RestaurantSearchHit {
  readonly restaurantId: string;
  readonly name: string;
  readonly category: string;
  readonly isOpenNow: boolean;
  readonly highlights: readonly string[];
}

export interface CategoryCount {
  readonly category: string;
  readonly restaurantCount: number;
}

export interface RestaurantSearchResults {
  readonly hits: readonly RestaurantSearchHit[];
  readonly categories: readonly CategoryCount[];
  readonly suggestion: string | undefined;
}

export class SearchIndexUnavailableError extends Error {
  override readonly name = 'SearchIndexUnavailableError';
}

export interface RestaurantSearchIndex {
  save(restaurant: SearchableRestaurant): Promise<boolean>;
  search(search: RestaurantSearch): Promise<RestaurantSearchResults>;
  rebuild(loadRestaurants: () => Promise<readonly SearchableRestaurant[]>): Promise<void>;
}
