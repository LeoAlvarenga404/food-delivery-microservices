import type { Principal } from '#domain/identity/principal.value-object.ts';
import type { NotRestaurantMember } from '#domain/membership/restaurant-membership.value-object.ts';
import type { RestaurantId } from '#domain/ticket/restaurant-id.value-object.ts';

export interface ListTicketsQuery {
  readonly principal: Principal;
  readonly restaurantId: RestaurantId;
}

export type ListTicketsError = NotRestaurantMember;
