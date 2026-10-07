import { left, right } from '@fd/domain';
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
import { GetRestaurantQueryHandler } from './get-restaurant.query-handler.ts';

const stored = buildRestaurant({ version: 3 });

function handler(): GetRestaurantQueryHandler {
  return new GetRestaurantQueryHandler(new InMemoryRestaurantRepository([stored]));
}

describe('GetRestaurantQueryHandler', () => {
  it('returns the restaurant to one of its members', async () => {
    const outcome = await handler().execute({
      principal: { staffMemberId: staffAId },
      restaurantId: pizzeriaId,
    });

    expect(outcome).toEqual(right(stored.toSnapshot()));
  });

  it('refuses a staff member who is not a member', async () => {
    const outcome = await handler().execute({
      principal: { staffMemberId: staffBId },
      restaurantId: pizzeriaId,
    });

    expect(outcome).toEqual(
      left({ type: 'NotRestaurantMember', restaurantId: pizzeriaId, staffMemberId: staffBId }),
    );
  });

  it('answers a restaurant that was never onboarded as not found', async () => {
    const unknownRestaurantId = unwrap(parseRestaurantId('0199a5d0-0000-7000-8000-0000000000bf'));

    const outcome = await handler().execute({
      principal: { staffMemberId: staffAId },
      restaurantId: unknownRestaurantId,
    });

    expect(outcome).toEqual(
      left({ type: 'RestaurantNotFound', restaurantId: unknownRestaurantId }),
    );
  });
});
