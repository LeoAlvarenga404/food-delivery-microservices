import type { RestaurantId } from '#domain/ticket/restaurant-id.value-object.ts';
import type { StaffMemberId } from './staff-member-id.value-object.ts';

export interface RestaurantMembership {
  readonly restaurantId: RestaurantId;
  readonly version: number;
  readonly staffMemberIds: readonly StaffMemberId[];
}
