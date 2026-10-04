import type { MessageMetadata } from '#application/ports/unit-of-work.port.ts';
import type { Principal } from '#domain/identity/principal.value-object.ts';
import type { RestaurantId } from '#domain/restaurant/restaurant-id.value-object.ts';
import type {
  InvalidRestaurantProfile,
  RawRestaurantProfile,
} from '#domain/restaurant/restaurant-profile.value-object.ts';

export interface OnboardRestaurantCommand {
  readonly principal: Principal;
  readonly profile: RawRestaurantProfile;
  readonly metadata: MessageMetadata;
}

export type OnboardRestaurantError = InvalidRestaurantProfile;

export interface OnboardedRestaurant {
  readonly restaurantId: RestaurantId;
}
