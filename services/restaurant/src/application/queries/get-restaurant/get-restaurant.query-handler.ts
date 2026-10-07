import { left, right, type Either } from '@fd/domain';
import type { RestaurantSnapshot } from '#domain/restaurant/restaurant.aggregate.ts';
import type { RestaurantRepository } from '#domain/restaurant/restaurant.repository.ts';
import type { GetRestaurantError, GetRestaurantQuery } from './get-restaurant.query.ts';

export class GetRestaurantQueryHandler {
  readonly #restaurants: RestaurantRepository;

  constructor(restaurants: RestaurantRepository) {
    this.#restaurants = restaurants;
  }

  async execute(
    query: GetRestaurantQuery,
  ): Promise<Either<GetRestaurantError, RestaurantSnapshot>> {
    const { restaurantId, principal } = query;
    const restaurant = await this.#restaurants.findById(restaurantId);
    if (restaurant === undefined) return left({ type: 'RestaurantNotFound', restaurantId });
    const membership = restaurant.verifyMember(principal.staffMemberId);
    if (membership.isLeft()) return membership;
    return right(restaurant.toSnapshot());
  }
}
