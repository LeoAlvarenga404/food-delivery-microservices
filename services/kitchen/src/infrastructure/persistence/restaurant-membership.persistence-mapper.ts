import type { Selectable } from 'kysely';
import type { RestaurantMembership } from '#domain/membership/restaurant-membership.value-object.ts';
import type { StaffMemberId } from '#domain/membership/staff-member-id.value-object.ts';
import type { RestaurantId } from '#domain/ticket/restaurant-id.value-object.ts';
import type { RestaurantMemberships } from './generated/database.ts';

export type RestaurantMembershipRow = Selectable<RestaurantMemberships>;

export const restaurantMembershipPersistenceMapper = {
  toDomain(row: RestaurantMembershipRow): RestaurantMembership {
    return {
      restaurantId: row.restaurantId as RestaurantId,
      version: row.version,
      staffMemberIds: row.staffMemberIds as unknown as readonly StaffMemberId[],
    };
  },

  toPersistence(membership: RestaurantMembership): RestaurantMembershipRow {
    return {
      restaurantId: membership.restaurantId,
      version: membership.version,
      staffMemberIds: [...membership.staffMemberIds],
    };
  },
};
