import { left, right } from '@fd/domain';
import { describe, expect, it } from 'vitest';
import { FakeClock } from '../../../../test/support/clock.fake.ts';
import { InMemoryRestaurantSearchIndex } from '../../../../test/support/in-memory-restaurant-search-index.adapter.ts';
import { buildSearchableRestaurant } from '../../../../test/support/searchable-restaurant.builder.ts';
import type { SearchRestaurantsQuery } from './search-restaurants.query.ts';
import { SearchRestaurantsQueryHandler } from './search-restaurants.query-handler.ts';

const pizzeriaId = '0199a5d0-0000-7000-8000-0000000000b1';
const pizzaQuery: SearchRestaurantsQuery = {
  text: ' bella ',
  category: ' Pizza ',
  origin: undefined,
  radiusInKilometers: undefined,
  limit: 10,
};

async function handlerAt(now: Date): Promise<SearchRestaurantsQueryHandler> {
  const searchIndex = new InMemoryRestaurantSearchIndex();
  await searchIndex.save(buildSearchableRestaurant({ name: 'Pizzaria Bella' }));
  return new SearchRestaurantsQueryHandler(searchIndex, new FakeClock(now));
}

describe('SearchRestaurantsQueryHandler', () => {
  it.each([
    { moment: 'Friday 18:30 in Sao Paulo', now: '2026-10-02T21:30:00.000Z', isOpenNow: true },
    { moment: 'Friday 09:00 in Sao Paulo', now: '2026-10-02T12:00:00.000Z', isOpenNow: false },
  ])(
    'searches the index with trimmed criteria at the clock time, $moment',
    async ({ now, isOpenNow }) => {
      const handler = await handlerAt(new Date(now));

      const outcome = await handler.execute(pizzaQuery);

      expect(outcome).toEqual(
        right({
          hits: [
            {
              restaurantId: pizzeriaId,
              name: 'Pizzaria Bella',
              category: 'Pizza',
              isOpenNow,
              highlights: [],
            },
          ],
          categories: [{ category: 'Pizza', restaurantCount: 1 }],
          suggestion: undefined,
        }),
      );
    },
  );

  it('refuses invalid criteria before searching, naming the field', async () => {
    const handler = await handlerAt(new Date('2026-10-02T21:30:00.000Z'));

    const outcome = await handler.execute({ ...pizzaQuery, limit: 51 });

    expect(outcome).toEqual(left({ type: 'InvalidSearchCriteria', field: 'limit' }));
  });
});
