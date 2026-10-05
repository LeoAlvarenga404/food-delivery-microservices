import { right, type Either } from '@fd/domain';
import type { Clock } from '#application/ports/clock.port.ts';
import type {
  RestaurantSearchIndex,
  RestaurantSearchResults,
} from '#application/ports/restaurant-search-index.port.ts';
import {
  parseRestaurantSearchCriteria,
  type InvalidSearchCriteria,
} from '#domain/search/restaurant-search-criteria.value-object.ts';
import type { SearchRestaurantsQuery } from './search-restaurants.query.ts';

export class SearchRestaurantsQueryHandler {
  readonly #searchIndex: RestaurantSearchIndex;
  readonly #clock: Clock;

  constructor(searchIndex: RestaurantSearchIndex, clock: Clock) {
    this.#searchIndex = searchIndex;
    this.#clock = clock;
  }

  async execute(
    query: SearchRestaurantsQuery,
  ): Promise<Either<InvalidSearchCriteria, RestaurantSearchResults>> {
    const criteria = parseRestaurantSearchCriteria(query);
    if (criteria.isLeft()) return criteria;
    const searchedAt = this.#clock.now();
    return right(await this.#searchIndex.search({ ...criteria.success, searchedAt }));
  }
}
