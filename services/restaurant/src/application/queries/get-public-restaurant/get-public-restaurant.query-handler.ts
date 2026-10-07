import { left, right, type Either } from '@fd/domain';
import type { RestaurantSnapshot } from '#domain/restaurant/restaurant.aggregate.ts';
import type { RestaurantNotFound } from '#domain/restaurant/restaurant.errors.ts';
import type { RestaurantRepository } from '#domain/restaurant/restaurant.repository.ts';
import type { GetPublicRestaurantQuery } from './get-public-restaurant.query.ts';

export class GetPublicRestaurantQueryHandler {
  readonly #restaurants: RestaurantRepository;

  constructor(restaurants: RestaurantRepository) {
    this.#restaurants = restaurants;
  }

  async execute(
    query: GetPublicRestaurantQuery,
  ): Promise<Either<RestaurantNotFound, RestaurantSnapshot>> {
    const { restaurantId } = query;
    const restaurant = await this.#restaurants.findById(restaurantId);
    if (restaurant === undefined) return left({ type: 'RestaurantNotFound', restaurantId });
    return right(restaurant.toSnapshot());
  }
}
