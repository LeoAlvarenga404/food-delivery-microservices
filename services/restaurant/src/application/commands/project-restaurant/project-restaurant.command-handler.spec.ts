import { left, right } from '@fd/domain';
import { beforeEach, describe, expect, it } from 'vitest';
import { InMemoryRestaurantSearchIndex } from '../../../../test/support/in-memory-restaurant-search-index.adapter.ts';
import { buildSearchableRestaurant } from '../../../../test/support/searchable-restaurant.builder.ts';
import { ProjectRestaurantCommandHandler } from './project-restaurant.command-handler.ts';

const fridayEvening = new Date('2026-10-02T21:30:00.000Z');
const pizzeriaId = '0199a5d0-0000-7000-8000-0000000000b1';

let searchIndex: InMemoryRestaurantSearchIndex;
let handler: ProjectRestaurantCommandHandler;

async function namesFoundBy(text: string): Promise<readonly string[]> {
  const results = await searchIndex.search({
    text,
    category: undefined,
    origin: undefined,
    radiusInKilometers: undefined,
    limit: 20,
    searchedAt: fridayEvening,
  });
  return results.hits.map((hit) => hit.name);
}

beforeEach(async () => {
  searchIndex = new InMemoryRestaurantSearchIndex();
  handler = new ProjectRestaurantCommandHandler(searchIndex);
  await searchIndex.save(buildSearchableRestaurant({ name: 'Pizzaria Bella', version: 3 }));
});

describe('ProjectRestaurantCommandHandler', () => {
  it('projects a newer snapshot of the restaurant into the search index', async () => {
    const revised = buildSearchableRestaurant({ name: 'Pizzaria Nova', version: 4 });

    const outcome = await handler.execute({ restaurant: revised });

    expect(outcome).toEqual(right(undefined));
    expect(await namesFoundBy('nova')).toEqual(['Pizzaria Nova']);
  });

  it.each([
    { scenario: 'the version the index already has', version: 3 },
    { scenario: 'an older version', version: 2 },
  ])('ignores a snapshot with $scenario and keeps the index as it was', async ({ version }) => {
    const stale = buildSearchableRestaurant({ name: 'Pizzaria Antiga', version });

    const outcome = await handler.execute({ restaurant: stale });

    expect(outcome).toEqual(
      left({ type: 'StaleRestaurantProjection', restaurantId: pizzeriaId, version }),
    );
    expect(await namesFoundBy('antiga')).toEqual([]);
    expect(await namesFoundBy('bella')).toEqual(['Pizzaria Bella']);
  });
});
