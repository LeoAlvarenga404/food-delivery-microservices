import { isUuid, left, right, type Brand, type Either } from '@fd/domain';

export type StaffMemberId = Brand<string, 'StaffMemberId'>;

export interface InvalidStaffMemberId {
  readonly type: 'InvalidStaffMemberId';
  readonly rawStaffMemberId: string;
}

export function parseStaffMemberId(
  rawStaffMemberId: string,
): Either<InvalidStaffMemberId, StaffMemberId> {
  if (!isUuid(rawStaffMemberId)) return left({ type: 'InvalidStaffMemberId', rawStaffMemberId });
  return right(rawStaffMemberId.toLowerCase() as StaffMemberId);
}
