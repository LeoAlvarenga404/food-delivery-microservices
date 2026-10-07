import { PermanentMessageFailure } from '@fd/chassis-kafka';
import { describe, expect, it } from 'vitest';
import { buildMenuRevisedMessage } from '../../../../test/support/menu-revised-message.builder.ts';
import {
  pizzeriaMembership,
  staffAId,
  staffBId,
} from '../../../../test/support/restaurant-membership.builder.ts';
import { toApplyMembershipRevisionCommand } from './menu-revised.message-mapper.ts';

const restaurant = { restaurantId: pizzeriaMembership.restaurantId, version: 2, currency: 'BRL' };
const members = [{ staffMemberId: staffAId }, { staffMemberId: staffBId }];

describe('toApplyMembershipRevisionCommand', () => {
  it('reads the restaurant, its version and its members from a MenuRevised snapshot', () => {
    const message = buildMenuRevisedMessage({ restaurant, members });

    expect(toApplyMembershipRevisionCommand(message)).toEqual({
      membership: { ...pizzeriaMembership, staffMemberIds: [staffAId, staffBId] },
    });
  });

  it('reads the ids in canonical lowercase form', () => {
    const message = buildMenuRevisedMessage({
      restaurant: { ...restaurant, restaurantId: restaurant.restaurantId.toUpperCase() },
      members: [{ staffMemberId: staffAId.toUpperCase() }],
    });

    expect(toApplyMembershipRevisionCommand(message)).toEqual({
      membership: { ...pizzeriaMembership, staffMemberIds: [staffAId] },
    });
  });

  it.each([
    {
      problem: 'a message type the state topic does not carry',
      message: buildMenuRevisedMessage(
        { restaurant, members },
        { messageType: 'fooddelivery.restaurant.v1.RestaurantClosed' },
      ),
    },
    {
      problem: 'a payload that does not decode',
      message: {
        ...buildMenuRevisedMessage({ restaurant, members }),
        payload: Uint8Array.of(0xff),
      },
    },
    {
      problem: 'a snapshot without a restaurant',
      message: buildMenuRevisedMessage({ members }),
    },
    {
      problem: 'a restaurant id that is not a uuid',
      message: buildMenuRevisedMessage({
        restaurant: { ...restaurant, restaurantId: 'pizzeria' },
        members,
      }),
    },
    {
      problem: 'a version of zero',
      message: buildMenuRevisedMessage({ restaurant: { ...restaurant, version: 0 }, members }),
    },
    {
      problem: 'a member id that is not a uuid',
      message: buildMenuRevisedMessage({ restaurant, members: [{ staffMemberId: 'staff-a' }] }),
    },
  ])('treats $problem as a permanent failure', ({ message }) => {
    expect(() => toApplyMembershipRevisionCommand(message)).toThrow(PermanentMessageFailure);
  });
});
