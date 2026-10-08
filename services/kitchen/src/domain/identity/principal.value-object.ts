import { left, right, type Either } from '@fd/domain';
import {
  parseStaffMemberId,
  type StaffMemberId,
} from '#domain/membership/staff-member-id.value-object.ts';

export interface Principal {
  readonly staffMemberId: StaffMemberId;
}

export interface PrincipalClaims {
  readonly subject: string;
  readonly roles: readonly string[];
}

export interface MissingRestaurantStaffRole {
  readonly type: 'MissingRestaurantStaffRole';
}

export interface InvalidPrincipalSubject {
  readonly type: 'InvalidPrincipalSubject';
  readonly subject: string;
}

export type PrincipalError = MissingRestaurantStaffRole | InvalidPrincipalSubject;

const restaurantStaffRole = 'restaurant_staff';

export function parsePrincipal(claims: PrincipalClaims): Either<PrincipalError, Principal> {
  if (!claims.roles.includes(restaurantStaffRole)) {
    return left({ type: 'MissingRestaurantStaffRole' });
  }
  const staffMemberId = parseStaffMemberId(claims.subject);
  if (staffMemberId.isLeft()) {
    return left({ type: 'InvalidPrincipalSubject', subject: claims.subject });
  }
  return right({ staffMemberId: staffMemberId.success });
}
