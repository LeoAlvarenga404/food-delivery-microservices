import type { RestaurantSearchIndex } from '#application/ports/restaurant-search-index.port.ts';
import type { RestaurantRepository } from '#domain/restaurant/restaurant.repository.ts';

export class RebuildSearchIndexCommandHandler {
  readonly #restaurants: RestaurantRepository;
  readonly #searchIndex: RestaurantSearchIndex;

  constructor(restaurants: RestaurantRepository, searchIndex: RestaurantSearchIndex) {
    this.#restaurants = restaurants;
    this.#searchIndex = searchIndex;
  }

  async execute(): Promise<number> {
    let restaurantCount = 0;
    await this.#searchIndex.rebuild(async () => {
      const restaurants = await this.#restaurants.findAll();
      restaurantCount = restaurants.length;
      return restaurants.map((restaurant) => restaurant.toSnapshot());
    });
    return restaurantCount;
  }
}
