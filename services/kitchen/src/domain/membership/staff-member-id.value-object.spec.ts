import { left, right } from '@fd/domain';
import { describe, expect, it } from 'vitest';
import { parseStaffMemberId } from './staff-member-id.value-object.ts';

describe('parseStaffMemberId', () => {
  it('returns the canonical lowercase form of a UUID', () => {
    expect(parseStaffMemberId('0199A5D0-0000-7000-8000-0000000000E1')).toEqual(
      right('0199a5d0-0000-7000-8000-0000000000e1'),
    );
  });

  it.each(['', 'staff-1', '0199a5d0-0000-7000-8000-0000000000e1x'])(
    'rejects "%s"',
    (rawStaffMemberId) => {
      expect(parseStaffMemberId(rawStaffMemberId)).toEqual(
        left({ type: 'InvalidStaffMemberId', rawStaffMemberId }),
      );
    },
  );
});
