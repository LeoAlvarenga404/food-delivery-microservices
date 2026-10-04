import type { RestaurantRepository } from '#domain/restaurant/restaurant.repository.ts';
import type { ListMembershipsQuery, RestaurantMembership } from './list-memberships.query.ts';

export class ListMembershipsQueryHandler {
  readonly #restaurants: RestaurantRepository;

  constructor(restaurants: RestaurantRepository) {
    this.#restaurants = restaurants;
  }

  async execute(query: ListMembershipsQuery): Promise<readonly RestaurantMembership[]> {
    const { staffMemberId } = query.principal;
    const restaurants = await this.#restaurants.findByMember(staffMemberId);
    return restaurants.flatMap((restaurant) => {
      const { restaurantId, name, members } = restaurant.toSnapshot();
      return members
        .filter((member) => member.staffMemberId === staffMemberId)
        .map(({ role }) => ({ restaurantId, restaurantName: name, role }));
    });
  }
}
