import { left, right } from '@fd/domain';
import { describe, expect, it } from 'vitest';
import {
  pizzeriaMembership,
  staffAId,
  staffBId,
} from '../../../test/support/restaurant-membership.builder.ts';
import { restaurantId } from '../../../test/support/ticket.builder.ts';
import { verifyMember } from './restaurant-membership.value-object.ts';

describe('verifyMember', () => {
  it('admits a member of the restaurant', () => {
    expect(verifyMember(pizzeriaMembership, restaurantId, staffAId)).toEqual(right(undefined));
  });

  it('refuses a staff member who is not a member', () => {
    expect(verifyMember(pizzeriaMembership, restaurantId, staffBId)).toEqual(
      left({ type: 'NotRestaurantMember', restaurantId, staffMemberId: staffBId }),
    );
  });

  it('refuses everyone for a restaurant whose members Kitchen has not received', () => {
    expect(verifyMember(undefined, restaurantId, staffAId)).toEqual(
      left({ type: 'NotRestaurantMember', restaurantId, staffMemberId: staffAId }),
    );
  });
});
