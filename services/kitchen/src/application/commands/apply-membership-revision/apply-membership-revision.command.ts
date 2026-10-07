import type { RestaurantMembership } from '#domain/membership/restaurant-membership.value-object.ts';
import type { RestaurantId } from '#domain/ticket/restaurant-id.value-object.ts';

export interface ApplyMembershipRevisionCommand {
  readonly membership: RestaurantMembership;
}

export interface StaleMembershipRevision {
  readonly type: 'StaleMembershipRevision';
  readonly restaurantId: RestaurantId;
  readonly version: number;
}
