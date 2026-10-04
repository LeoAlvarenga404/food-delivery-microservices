import type { Principal } from '#domain/identity/principal.value-object.ts';
import type { RestaurantId } from '#domain/restaurant/restaurant-id.value-object.ts';
import type {
  NotRestaurantMember,
  RestaurantNotFound,
} from '#domain/restaurant/restaurant.errors.ts';

export interface GetRestaurantQuery {
  readonly principal: Principal;
  readonly restaurantId: RestaurantId;
}

export type GetRestaurantError = RestaurantNotFound | NotRestaurantMember;
