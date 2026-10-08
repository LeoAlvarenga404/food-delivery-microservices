import { left, right, type Either } from '@fd/domain';
import type { RestaurantId } from '#domain/ticket/restaurant-id.value-object.ts';
import type { StaffMemberId } from './staff-member-id.value-object.ts';

export interface RestaurantMembership {
  readonly restaurantId: RestaurantId;
  readonly version: number;
  readonly staffMemberIds: readonly StaffMemberId[];
}

export interface NotRestaurantMember {
  readonly type: 'NotRestaurantMember';
  readonly restaurantId: RestaurantId;
  readonly staffMemberId: StaffMemberId;
}

export function verifyMember(
  membership: RestaurantMembership | undefined,
  restaurantId: RestaurantId,
  staffMemberId: StaffMemberId,
): Either<NotRestaurantMember, undefined> {
  if (membership?.staffMemberIds.includes(staffMemberId) === true) return right(undefined);
  return left({ type: 'NotRestaurantMember', restaurantId, staffMemberId });
}
