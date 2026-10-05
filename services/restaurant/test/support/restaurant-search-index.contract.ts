import { beforeEach, describe, expect, it } from 'vitest';
import type {
  RestaurantSearch,
  RestaurantSearchIndex,
  RestaurantSearchResults,
} from '#application/ports/restaurant-search-index.port.ts';
import { buildSearchableRestaurant } from './searchable-restaurant.builder.ts';

const pizzeriaId = '0199a5d0-0000-7000-8000-0000000000b1';
const cantinaId = '0199a5d0-0000-7000-8000-0000000000b2';
const burgerJointId = '0199a5d0-0000-7000-8000-0000000000b3';
const fridayEveningInSaoPaulo = new Date('2026-10-02T21:30:00.000Z');
const threeKilometersFromThePizzeria = { latitude: -23.5874, longitude: -46.6576 };

const browseEverything: RestaurantSearch = {
  text: '',
  category: undefined,
  origin: undefined,
  radiusInKilometers: undefined,
  limit: 20,
  searchedAt: fridayEveningInSaoPaulo,
};

const pizzeria = buildSearchableRestaurant({ restaurantId: pizzeriaId, name: 'Pizzaria Bella' });
const cantina = buildSearchableRestaurant({
  restaurantId: cantinaId,
  name: 'Cantina Nonna',
  timeZone: 'Asia/Tokyo',
});
const burgerJoint = buildSearchableRestaurant({
  restaurantId: burgerJointId,
  name: 'Burger House',
  category: 'Lanches',
  location: { latitude: -23.8, longitude: -46.4 },
  menuItems: [
    {
      menuItemId: '0199a5d0-0000-7000-8000-000000000d03',
      name: 'Cheeseburger',
      priceInCents: 3200n,
      isAvailable: true,
    },
  ],
});

function idsOf(results: RestaurantSearchResults): readonly string[] {
  return results.hits.map((hit) => hit.restaurantId);
}

export function describeRestaurantSearchIndexContract(
  implementationName: string,
  createSearchIndex: () => Promise<RestaurantSearchIndex>,
): void {
  describe(`${implementationName} restaurant search index`, () => {
    let searchIndex: RestaurantSearchIndex;

    beforeEach(async () => {
      searchIndex = await createSearchIndex();
    });

    it('finds a saved restaurant by a word of its name, with its name and category', async () => {
      await searchIndex.save(pizzeria);
      await searchIndex.save(burgerJoint);

      const results = await searchIndex.search({ ...browseEverything, text: 'bella' });

      expect(
        results.hits.map(({ restaurantId, name, category }) => ({ restaurantId, name, category })),
      ).toEqual([{ restaurantId: pizzeriaId, name: 'Pizzaria Bella', category: 'Pizza' }]);
    });

    it('finds a restaurant by an available dish but not by an unavailable one', async () => {
      await searchIndex.save(pizzeria);
      await searchIndex.save(burgerJoint);

      const byAvailableDish = await searchIndex.search({ ...browseEverything, text: 'margherita' });
      const byUnavailableDish = await searchIndex.search({ ...browseEverything, text: 'guarana' });

      expect(idsOf(byAvailableDish)).toEqual([pizzeriaId]);
      expect(idsOf(byUnavailableDish)).toEqual([]);
    });

    it('saves a newer version over the stored document', async () => {
      await searchIndex.save(pizzeria);

      const wasSaved = await searchIndex.save({
        ...cantina,
        restaurantId: pizzeria.restaurantId,
        version: 2,
      });

      expect(wasSaved).toBe(true);
      expect(idsOf(await searchIndex.search({ ...browseEverything, text: 'bella' }))).toEqual([]);
      expect(idsOf(await searchIndex.search({ ...browseEverything, text: 'nonna' }))).toEqual([
        pizzeriaId,
      ]);
    });

    it.each([
      { scenario: 'the same version', version: 3 },
      { scenario: 'an older version', version: 2 },
    ])('ignores a save with $scenario and keeps the stored document', async ({ version }) => {
      await searchIndex.save({ ...pizzeria, version: 3 });

      const wasSaved = await searchIndex.save({
        ...cantina,
        restaurantId: pizzeria.restaurantId,
        version,
      });

      expect(wasSaved).toBe(false);
      expect(idsOf(await searchIndex.search({ ...browseEverything, text: 'nonna' }))).toEqual([]);
      expect(idsOf(await searchIndex.search({ ...browseEverything, text: 'bella' }))).toEqual([
        pizzeriaId,
      ]);
    });

    it('filters by category while counting every category of the matching restaurants', async () => {
      await searchIndex.save(pizzeria);
      await searchIndex.save(cantina);
      await searchIndex.save(burgerJoint);

      const results = await searchIndex.search({ ...browseEverything, category: 'Lanches' });

      expect(idsOf(results)).toEqual([burgerJointId]);
      expect(results.categories).toEqual([
        { category: 'Pizza', restaurantCount: 2 },
        { category: 'Lanches', restaurantCount: 1 },
      ]);
    });

    it('keeps only the restaurants within the radius of the origin', async () => {
      await searchIndex.save(pizzeria);
      await searchIndex.save(burgerJoint);

      const results = await searchIndex.search({
        ...browseEverything,
        origin: threeKilometersFromThePizzeria,
        radiusInKilometers: 5,
      });

      expect(idsOf(results)).toEqual([pizzeriaId]);
    });

    it('answers at most the limit, ordering equally relevant restaurants by id', async () => {
      const closedEverywhere = {
        ...browseEverything,
        searchedAt: new Date('2026-10-05T15:00:00.000Z'),
      };
      await searchIndex.save(burgerJoint);
      await searchIndex.save(cantina);
      await searchIndex.save(pizzeria);

      const results = await searchIndex.search({ ...closedEverywhere, limit: 2 });

      expect(idsOf(results)).toEqual([pizzeriaId, cantinaId]);
    });

    it('tells whether each restaurant is open at the moment of the search in its own time zone', async () => {
      await searchIndex.save(pizzeria);
      await searchIndex.save(cantina);

      const results = await searchIndex.search(browseEverything);

      expect(
        results.hits.map(({ restaurantId, isOpenNow }) => ({ restaurantId, isOpenNow })),
      ).toEqual([
        { restaurantId: pizzeriaId, isOpenNow: true },
        { restaurantId: cantinaId, isOpenNow: false },
      ]);
    });

    it.each([
      {
        moment: 'Monday 01:00 after a Sunday overnight period',
        instant: '2026-10-05T04:00:00.000Z',
        isOpenNow: true,
      },
      {
        moment: 'Monday 02:00, the closing minute of that period',
        instant: '2026-10-05T05:00:00.000Z',
        isOpenNow: false,
      },
      {
        moment: 'Sunday 17:59, the minute before it opens',
        instant: '2026-10-04T20:59:00.000Z',
        isOpenNow: false,
      },
    ])('is open: $isOpenNow on $moment', async ({ instant, isOpenNow }) => {
      await searchIndex.save(
        buildSearchableRestaurant({
          openingHours: [{ dayOfWeek: 'SUNDAY', opensAt: '18:00', closesAt: '02:00' }],
        }),
      );

      const results = await searchIndex.search({
        ...browseEverything,
        searchedAt: new Date(instant),
      });

      expect(results.hits.map((hit) => hit.isOpenNow)).toEqual([isOpenNow]);
    });

    it.each([
      {
        season: 'daylight saving time in July',
        instant: '2026-07-06T22:30:00.000Z',
        isOpenNow: true,
      },
      { season: 'standard time in January', instant: '2026-01-05T22:30:00.000Z', isOpenNow: false },
    ])(
      'follows the time zone of the restaurant through $season',
      async ({ instant, isOpenNow }) => {
        await searchIndex.save(
          buildSearchableRestaurant({
            timeZone: 'America/New_York',
            openingHours: [{ dayOfWeek: 'MONDAY', opensAt: '18:00', closesAt: '22:00' }],
          }),
        );

        const results = await searchIndex.search({
          ...browseEverything,
          searchedAt: new Date(instant),
        });

        expect(results.hits.map((hit) => hit.isOpenNow)).toEqual([isOpenNow]);
      },
    );

    it('rebuilds from the loaded restaurants, dropping the others and keeping changes made meanwhile', async () => {
      await searchIndex.save({ ...pizzeria, version: 2 });
      await searchIndex.save(burgerJoint);
      const renamedPizzeria = { ...pizzeria, name: cantina.name, version: 3 };
      const loads = [[renamedPizzeria], [renamedPizzeria, cantina]];

      await searchIndex.rebuild(() => Promise.resolve(loads.shift() ?? []));

      const results = await searchIndex.search(browseEverything);
      expect(idsOf(results)).toEqual([pizzeriaId, cantinaId]);
      expect(results.hits.map((hit) => hit.name)).toEqual(['Cantina Nonna', 'Cantina Nonna']);
    });

    it('serves the first load while the second one runs and keeps a revision saved meanwhile', async () => {
      await searchIndex.save(burgerJoint);
      let loadCount = 0;
      let idsDuringSecondLoad: readonly string[] = [];

      await searchIndex.rebuild(async () => {
        loadCount += 1;
        if (loadCount === 2) {
          idsDuringSecondLoad = idsOf(await searchIndex.search(browseEverything));
          await searchIndex.save(
            buildSearchableRestaurant({
              restaurantId: pizzeriaId,
              name: 'Pizzaria Nova',
              version: 4,
            }),
          );
        }
        return [pizzeria];
      });

      const results = await searchIndex.search(browseEverything);
      expect(idsDuringSecondLoad).toEqual([pizzeriaId]);
      expect(results.hits.map((hit) => hit.name)).toEqual(['Pizzaria Nova']);
    });
  });
}
