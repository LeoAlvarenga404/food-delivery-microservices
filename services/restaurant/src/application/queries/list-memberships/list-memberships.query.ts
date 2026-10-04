import type { Principal } from '#domain/identity/principal.value-object.ts';
import type { RestaurantId } from '#domain/restaurant/restaurant-id.value-object.ts';
import type { RestaurantName } from '#domain/restaurant/restaurant-name.value-object.ts';
import type { MembershipRole } from '#domain/restaurant/restaurant.aggregate.ts';

export interface ListMembershipsQuery {
  readonly principal: Principal;
}

export interface RestaurantMembership {
  readonly restaurantId: RestaurantId;
  readonly restaurantName: RestaurantName;
  readonly role: MembershipRole;
}
