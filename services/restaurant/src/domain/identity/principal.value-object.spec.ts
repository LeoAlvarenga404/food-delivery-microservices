import { left, right } from '@fd/domain';
import { describe, expect, it } from 'vitest';
import { parsePrincipal } from './principal.value-object.ts';

const staffMemberId = '0199a5d0-0000-7000-8000-0000000000e1';

describe('parsePrincipal', () => {
  it('reads a staff member from the subject of a caller with the restaurant staff role', () => {
    expect(parsePrincipal({ subject: staffMemberId, roles: ['restaurant_staff'] })).toEqual(
      right({ staffMemberId }),
    );
  });

  it('keeps the restaurant staff role among other roles', () => {
    expect(
      parsePrincipal({ subject: staffMemberId, roles: ['consumer', 'restaurant_staff'] }),
    ).toEqual(right({ staffMemberId }));
  });

  it('returns the staff member id in canonical lowercase form', () => {
    expect(
      parsePrincipal({ subject: staffMemberId.toUpperCase(), roles: ['restaurant_staff'] }),
    ).toEqual(right({ staffMemberId }));
  });

  it.each([
    { scenario: 'only another role', roles: ['consumer'] },
    { scenario: 'no role', roles: [] },
    { scenario: 'only look-alike roles', roles: ['Restaurant_Staff', 'restaurant_staff_admin'] },
  ])('refuses a caller with $scenario', ({ roles }) => {
    expect(parsePrincipal({ subject: staffMemberId, roles })).toEqual(
      left({ type: 'MissingRestaurantStaffRole' }),
    );
  });

  it('refuses a subject that is not a uuid', () => {
    expect(parsePrincipal({ subject: 'staff-a', roles: ['restaurant_staff'] })).toEqual(
      left({ type: 'InvalidPrincipalSubject', subject: 'staff-a' }),
    );
  });
});
