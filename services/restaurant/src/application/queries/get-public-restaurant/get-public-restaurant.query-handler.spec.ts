import { left, right } from '@fd/domain';
import { describe, expect, it } from 'vitest';
import { InMemoryRestaurantRepository } from '../../../../test/support/in-memory-restaurant.repository.ts';
import {
  buildRestaurant,
  pizzeriaId,
  unwrap,
} from '../../../../test/support/restaurant.builder.ts';
import { parseRestaurantId } from '#domain/restaurant/restaurant-id.value-object.ts';
import { GetPublicRestaurantQueryHandler } from './get-public-restaurant.query-handler.ts';

const stored = buildRestaurant({ version: 3 });

function handler(): GetPublicRestaurantQueryHandler {
  return new GetPublicRestaurantQueryHandler(new InMemoryRestaurantRepository([stored]));
}

describe('GetPublicRestaurantQueryHandler', () => {
  it('returns the restaurant to anyone, without asking who is calling', async () => {
    const outcome = await handler().execute({ restaurantId: pizzeriaId });

    expect(outcome).toEqual(right(stored.toSnapshot()));
  });

  it('answers a restaurant that was never onboarded as not found', async () => {
    const unknownRestaurantId = unwrap(parseRestaurantId('0199a5d0-0000-7000-8000-0000000000bf'));

    const outcome = await handler().execute({ restaurantId: unknownRestaurantId });

    expect(outcome).toEqual(
      left({ type: 'RestaurantNotFound', restaurantId: unknownRestaurantId }),
    );
  });
});
