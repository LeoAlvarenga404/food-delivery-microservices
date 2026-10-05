import {
  Code,
  ConnectError,
  createClient,
  createRouterTransport,
  type Client,
} from '@connectrpc/connect';
import {
  RestaurantCatalogueService,
  SearchRestaurantsFailureSchema,
} from '@fd/contracts/fooddelivery/restaurant/v1/catalogue_pb.js';
import { DayOfWeek } from '@fd/contracts/fooddelivery/restaurant/v1/events_pb.js';
import { describe, expect, it } from 'vitest';
import { FakeClock } from '../../../test/support/clock.fake.ts';
import { InMemoryRestaurantRepository } from '../../../test/support/in-memory-restaurant.repository.ts';
import { buildRestaurant, pizzeriaId } from '../../../test/support/restaurant.builder.ts';
import {
  SearchIndexUnavailableError,
  type RestaurantSearch,
  type RestaurantSearchIndex,
  type RestaurantSearchResults,
} from '#application/ports/restaurant-search-index.port.ts';
import { GetPublicRestaurantQueryHandler } from '#application/queries/get-public-restaurant/get-public-restaurant.query-handler.ts';
import { SearchRestaurantsQueryHandler } from '#application/queries/search-restaurants/search-restaurants.query-handler.ts';
import { createRestaurantCatalogueRpcService } from './restaurant-catalogue.rpc-service.ts';

const searchedAt = new Date('2026-10-02T21:30:00.000Z');
const cannedResults: RestaurantSearchResults = {
  hits: [
    {
      restaurantId: '0199a5d0-0000-7000-8000-0000000000b2',
      name: 'Cantina Nonna',
      category: 'Italiana',
      isOpenNow: false,
      highlights: ['<em>Cantina</em> Nonna', '<em>Canelone</em>'],
    },
    {
      restaurantId: pizzeriaId,
      name: 'Pizzaria Bella',
      category: 'Pizza',
      isOpenNow: true,
      highlights: [],
    },
  ],
  categories: [
    { category: 'Pizza', restaurantCount: 7 },
    { category: 'Italiana', restaurantCount: 3 },
  ],
  suggestion: 'cantina',
};

class RecordingSearchIndex implements RestaurantSearchIndex {
  readonly searches: RestaurantSearch[] = [];
  readonly #results: RestaurantSearchResults;

  constructor(results: RestaurantSearchResults) {
    this.#results = results;
  }

  save(): Promise<boolean> {
    return Promise.resolve(true);
  }

  search(search: RestaurantSearch): Promise<RestaurantSearchResults> {
    this.searches.push(search);
    return Promise.resolve(this.#results);
  }

  rebuild(): Promise<void> {
    return Promise.resolve();
  }
}

function clientWith(searchIndex: RestaurantSearchIndex): Client<typeof RestaurantCatalogueService> {
  const transport = createRouterTransport(({ service }) => {
    service(
      RestaurantCatalogueService,
      createRestaurantCatalogueRpcService({
        searchRestaurants: new SearchRestaurantsQueryHandler(
          searchIndex,
          new FakeClock(searchedAt),
        ),
        getPublicRestaurant: new GetPublicRestaurantQueryHandler(
          new InMemoryRestaurantRepository([buildRestaurant({ version: 3 })]),
        ),
      }),
    );
  });
  return createClient(RestaurantCatalogueService, transport);
}

async function rejectionOf(call: Promise<unknown>): Promise<ConnectError> {
  return ConnectError.from(
    await call.then(
      () => undefined,
      (rejection: unknown) => rejection,
    ),
  );
}

describe('RestaurantCatalogueService.SearchRestaurants', () => {
  it('searches with the criteria of the request at the clock time and answers every result field', async () => {
    const searchIndex = new RecordingSearchIndex(cannedResults);

    const response = await clientWith(searchIndex).searchRestaurants({
      text: 'cantina',
      category: 'Italiana',
      origin: { latitude: -23.55, longitude: -46.63 },
      radiusInKilometers: 3.5,
      limit: 7,
    });

    expect(searchIndex.searches).toEqual([
      {
        text: 'cantina',
        category: 'Italiana',
        origin: { latitude: -23.55, longitude: -46.63 },
        radiusInKilometers: 3.5,
        limit: 7,
        searchedAt,
      },
    ]);
    expect(
      response.hits.map(({ restaurantId, name, category, isOpenNow, highlights }) => ({
        restaurantId,
        name,
        category,
        isOpenNow,
        highlights,
      })),
    ).toEqual(cannedResults.hits);
    expect(
      response.categories.map(({ category, restaurantCount }) => ({ category, restaurantCount })),
    ).toEqual(cannedResults.categories);
    expect(response.suggestion).toBe('cantina');
  });

  it('reads an empty category, no origin and a zero radius as no filter at all', async () => {
    const searchIndex = new RecordingSearchIndex({ ...cannedResults, suggestion: undefined });

    const response = await clientWith(searchIndex).searchRestaurants({ text: '', limit: 20 });

    expect(searchIndex.searches).toEqual([
      {
        text: '',
        category: undefined,
        origin: undefined,
        radiusInKilometers: undefined,
        limit: 20,
        searchedAt,
      },
    ]);
    expect(response.suggestion).toBe('');
  });

  it.each([
    { invalidPart: 'a control character in the text', request: { text: 'pizza\u0000', limit: 20 } },
    { invalidPart: 'a radius without an origin', request: { radiusInKilometers: 2, limit: 20 } },
    { invalidPart: 'no limit', request: { text: 'pizza' } },
  ])('refuses $invalidPart as an invalid argument naming the reason', async ({ request }) => {
    const searchIndex = new RecordingSearchIndex(cannedResults);

    const error = await rejectionOf(clientWith(searchIndex).searchRestaurants(request));

    expect(error.code).toBe(Code.InvalidArgument);
    expect(error.findDetails(SearchRestaurantsFailureSchema).at(0)?.reason).toBe(
      'InvalidSearchCriteria',
    );
    expect(searchIndex.searches).toEqual([]);
  });
});

describe('RestaurantCatalogueService.SearchRestaurants while the search index is down', () => {
  it('answers unavailable so the caller can retry later', async () => {
    const searchIndex = new RecordingSearchIndex(cannedResults);
    searchIndex.search = () =>
      Promise.reject(new SearchIndexUnavailableError('search index unavailable'));

    const error = await rejectionOf(clientWith(searchIndex).searchRestaurants({ limit: 20 }));

    expect(error.code).toBe(Code.Unavailable);
  });

  it('answers an internal error when the search fails for another reason', async () => {
    const searchIndex = new RecordingSearchIndex(cannedResults);
    searchIndex.search = () => Promise.reject(new Error('unexpected search failure'));

    const error = await rejectionOf(clientWith(searchIndex).searchRestaurants({ limit: 20 }));

    expect(error.code).toBe(Code.Internal);
  });
});

describe('RestaurantCatalogueService.GetPublicRestaurant', () => {
  const client = clientWith(new RecordingSearchIndex(cannedResults));

  it('answers the public state of a restaurant with its version', async () => {
    const response = await client.getPublicRestaurant({ restaurantId: pizzeriaId.toUpperCase() });

    expect(response.restaurant).toMatchObject({
      restaurantId: pizzeriaId,
      version: 3,
      name: 'Pizzaria Bella',
      category: 'Pizza',
      address: {
        street: 'Avenida Paulista',
        number: '1000',
        city: 'Sao Paulo',
        postalCode: '01310-100',
        location: { latitude: -23.5614, longitude: -46.6559 },
      },
      timeZone: 'America/Sao_Paulo',
      openingHours: [
        { dayOfWeek: DayOfWeek.FRIDAY, opensAt: '18:00', closesAt: '23:30' },
        { dayOfWeek: DayOfWeek.SATURDAY, opensAt: '18:00', closesAt: '02:00' },
      ],
      minimumOrderInCents: 2000n,
      currency: 'BRL',
      menuItems: [
        {
          menuItemId: '0199a5d0-0000-7000-8000-000000000d01',
          name: 'Margherita',
          priceInCents: 4500n,
          isAvailable: true,
        },
        {
          menuItemId: '0199a5d0-0000-7000-8000-000000000d02',
          name: 'Guarana',
          priceInCents: 800n,
          isAvailable: false,
        },
      ],
    });
  });

  it.each([
    {
      scenario: 'a restaurant that was never onboarded',
      restaurantId: '0199a5d0-0000-7000-8000-0000000000bf',
      code: Code.NotFound,
    },
    {
      scenario: 'an id that is not a uuid',
      restaurantId: 'pizzaria-bella',
      code: Code.InvalidArgument,
    },
  ])('refuses $scenario', async ({ restaurantId, code }) => {
    const error = await rejectionOf(client.getPublicRestaurant({ restaurantId }));

    expect(error.code).toBe(code);
  });
});
