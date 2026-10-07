import {
  parseStaffMemberId,
  type StaffMemberId,
} from '#domain/membership/staff-member-id.value-object.ts';
import type { RestaurantMembership } from '#domain/membership/restaurant-membership.value-object.ts';
import { parseRestaurantId } from '#domain/ticket/restaurant-id.value-object.ts';
import { restaurantId, unwrap } from './ticket.builder.ts';

export const staffAId: StaffMemberId = unwrap(
  parseStaffMemberId('0199a5d0-0000-7000-8000-0000000000e1'),
);
export const staffBId: StaffMemberId = unwrap(
  parseStaffMemberId('0199a5d0-0000-7000-8000-0000000000e2'),
);

export const pizzeriaMembership: RestaurantMembership = {
  restaurantId,
  version: 2,
  staffMemberIds: [staffAId],
};

export function membershipOf(
  rawRestaurantId: string,
  version: number,
  staffMemberIds: readonly StaffMemberId[],
): RestaurantMembership {
  return { restaurantId: unwrap(parseRestaurantId(rawRestaurantId)), version, staffMemberIds };
}
