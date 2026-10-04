import type { RestaurantId } from './restaurant-id.value-object.ts';
import type { StaffMemberId } from './staff-member-id.value-object.ts';

export interface RestaurantNotFound {
  readonly type: 'RestaurantNotFound';
  readonly restaurantId: RestaurantId;
}

export interface NotRestaurantMember {
  readonly type: 'NotRestaurantMember';
  readonly restaurantId: RestaurantId;
  readonly staffMemberId: StaffMemberId;
}
