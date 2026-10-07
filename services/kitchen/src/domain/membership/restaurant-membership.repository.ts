import type { RestaurantId } from '#domain/ticket/restaurant-id.value-object.ts';
import type { RestaurantMembership } from './restaurant-membership.value-object.ts';

export interface RestaurantMembershipRepository {
  findByRestaurantId(restaurantId: RestaurantId): Promise<RestaurantMembership | undefined>;
  saveIfNewer(membership: RestaurantMembership): Promise<boolean>;
}
