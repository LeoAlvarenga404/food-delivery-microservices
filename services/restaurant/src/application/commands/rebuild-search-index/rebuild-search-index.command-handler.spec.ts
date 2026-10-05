import { describe, expect, it } from 'vitest';
import { InMemoryRestaurantSearchIndex } from '../../../../test/support/in-memory-restaurant-search-index.adapter.ts';
import { InMemoryRestaurantRepository } from '../../../../test/support/in-memory-restaurant.repository.ts';
import {
  buildRestaurant,
  guarana,
  menuOf,
  unwrap,
} from '../../../../test/support/restaurant.builder.ts';
import { buildSearchableRestaurant } from '../../../../test/support/searchable-restaurant.builder.ts';
import { parseRestaurantId } from '#domain/restaurant/restaurant-id.value-object.ts';
import { RebuildSearchIndexCommandHandler } from './rebuild-search-index.command-handler.ts';

const burgerJointId = '0199a5d0-0000-7000-8000-0000000000b2';
const forgottenId = '0199a5d0-0000-7000-8000-0000000000b9';

describe('RebuildSearchIndexCommandHandler', () => {
  it('replaces the index with every stored restaurant and reports how many it indexed', async () => {
    const searchIndex = new InMemoryRestaurantSearchIndex();
    await searchIndex.save(
      buildSearchableRestaurant({ restaurantId: forgottenId, name: 'Antiga' }),
    );
    const pizzeria = buildRestaurant({ version: 4 });
    const burgerJoint = buildRestaurant({
      restaurantId: unwrap(parseRestaurantId(burgerJointId)),
      menuItems: menuOf([{ ...guarana, isAvailable: true }]),
    });
    const handler = new RebuildSearchIndexCommandHandler(
      new InMemoryRestaurantRepository([burgerJoint, pizzeria]),
      searchIndex,
    );

    const restaurantCount = await handler.execute();

    const idsFoundBy = async (text: string): Promise<readonly string[]> => {
      const results = await searchIndex.search({
        text,
        category: undefined,
        origin: undefined,
        radiusInKilometers: undefined,
        limit: 20,
        searchedAt: new Date('2026-10-02T21:30:00.000Z'),
      });
      return results.hits.map((hit) => hit.restaurantId);
    };
    expect(restaurantCount).toBe(2);
    expect(await idsFoundBy('')).toEqual([pizzeria.toSnapshot().restaurantId, burgerJointId]);
    expect(await idsFoundBy('guarana')).toEqual([burgerJointId]);
    expect(await searchIndex.save({ ...pizzeria.toSnapshot(), version: 4 })).toBe(false);
  });
});
