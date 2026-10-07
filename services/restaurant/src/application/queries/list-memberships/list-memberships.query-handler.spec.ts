import { describe, expect, it } from 'vitest';
import { InMemoryRestaurantRepository } from '../../../../test/support/in-memory-restaurant.repository.ts';
import {
  buildRestaurant,
  pizzeriaId,
  staffAId,
  staffBId,
  unwrap,
} from '../../../../test/support/restaurant.builder.ts';
import { parseRestaurantId } from '#domain/restaurant/restaurant-id.value-object.ts';
import { parseRestaurantName } from '#domain/restaurant/restaurant-name.value-object.ts';
import { parseStaffMemberId } from '#domain/restaurant/staff-member-id.value-object.ts';
import { ListMembershipsQueryHandler } from './list-memberships.query-handler.ts';

const burgerJointId = unwrap(parseRestaurantId('0199a5d0-0000-7000-8000-0000000000b2'));
const sushiBarId = unwrap(parseRestaurantId('0199a5d0-0000-7000-8000-0000000000b3'));

function handler(): ListMembershipsQueryHandler {
  return new ListMembershipsQueryHandler(
    new InMemoryRestaurantRepository([
      buildRestaurant(),
      buildRestaurant({
        restaurantId: burgerJointId,
        name: unwrap(parseRestaurantName('Burger Joint')),
        members: [{ staffMemberId: staffBId, role: 'OWNER' }],
      }),
      buildRestaurant({
        restaurantId: sushiBarId,
        name: unwrap(parseRestaurantName('Sushi Bar')),
        members: [
          { staffMemberId: staffAId, role: 'OWNER' },
          { staffMemberId: staffBId, role: 'OWNER' },
        ],
      }),
    ]),
  );
}

describe('ListMembershipsQueryHandler', () => {
  it('lists each restaurant of the principal once, with its own role', async () => {
    const memberships = await handler().execute({ principal: { staffMemberId: staffBId } });

    expect(memberships).toEqual([
      { restaurantId: burgerJointId, restaurantName: 'Burger Joint', role: 'OWNER' },
      { restaurantId: sushiBarId, restaurantName: 'Sushi Bar', role: 'OWNER' },
    ]);
  });

  it('leaves out the restaurants the principal does not belong to', async () => {
    const memberships = await handler().execute({ principal: { staffMemberId: staffAId } });

    expect(memberships.map((membership) => membership.restaurantId)).toEqual([
      pizzeriaId,
      sushiBarId,
    ]);
  });

  it('lists nothing for a staff member without restaurants', async () => {
    const stranger = unwrap(parseStaffMemberId('0199a5d0-0000-7000-8000-0000000000ef'));

    expect(await handler().execute({ principal: { staffMemberId: stranger } })).toEqual([]);
  });
});
