import { createServer, type Server } from 'node:http';
import { startOpenSearchContainer, type StartedOpenSearch } from '@fd/chassis-testing';
import { Client, errors } from '@opensearch-project/opensearch';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { describeRestaurantSearchIndexContract } from '../../../test/support/restaurant-search-index.contract.ts';
import {
  buildSearchableRestaurant,
  paulista,
} from '../../../test/support/searchable-restaurant.builder.ts';
import {
  SearchIndexUnavailableError,
  type RestaurantSearch,
} from '#application/ports/restaurant-search-index.port.ts';
import { OpenSearchRestaurantSearchIndex } from './open-search-restaurant-search-index.adapter.ts';
import { restaurantSearchDocumentPersistenceMapper } from './restaurant-search-document.persistence-mapper.ts';

const fridayEveningInSaoPaulo = new Date('2026-10-02T21:30:00.000Z');
const browseEverything: RestaurantSearch = {
  text: '',
  category: undefined,
  origin: undefined,
  radiusInKilometers: undefined,
  limit: 20,
  searchedAt: fridayEveningInSaoPaulo,
};

let openSearch: StartedOpenSearch;
let client: Client;
let createdIndexCount = 0;

async function startSearchEngineAnswering(statusCode: number): Promise<Server> {
  const searchEngine = createServer((request, response) => {
    response.writeHead(statusCode, { 'content-type': 'application/json' });
    response.end(JSON.stringify({ error: { type: 'search_engine_failure' }, status: statusCode }));
  });
  await new Promise<void>((resolve) => searchEngine.listen(0, '127.0.0.1', resolve));
  return searchEngine;
}

function clientOf(searchEngine: Server): Client {
  const address = searchEngine.address();
  const port = typeof address === 'object' ? address?.port : 0;
  return new Client({ node: `http://127.0.0.1:${String(port)}`, maxRetries: 0 });
}

async function createSearchIndex(): Promise<OpenSearchRestaurantSearchIndex> {
  createdIndexCount += 1;
  const searchIndex = new OpenSearchRestaurantSearchIndex({
    client,
    indexAlias: `restaurants-${String(createdIndexCount)}`,
    shouldRefreshOnWrite: true,
  });
  await searchIndex.createIfMissing();
  return searchIndex;
}

beforeAll(async () => {
  openSearch = await startOpenSearchContainer();
  client = new Client({ node: openSearch.url });
});

afterAll(async () => {
  await client.close();
  await openSearch.stop();
});

describeRestaurantSearchIndexContract('opensearch', createSearchIndex);

describe('OpenSearchRestaurantSearchIndex', () => {
  it('leaves one index behind the alias when two instances create it at once', async () => {
    const indexAlias = 'restaurants-created-twice';
    const settings = { client, indexAlias, shouldRefreshOnWrite: true };

    await Promise.all([
      new OpenSearchRestaurantSearchIndex(settings).createIfMissing(),
      new OpenSearchRestaurantSearchIndex(settings).createIfMissing(),
    ]);

    const response = await client.indices.getAlias({ name: indexAlias });
    expect(Object.keys(response.body)).toEqual([`${indexAlias}-initial`]);
  });

  it('reports a search engine it cannot reach as unavailable when saving and searching', async () => {
    const unreachableClient = new Client({ node: 'http://127.0.0.1:9', maxRetries: 0 });
    const unreachable = new OpenSearchRestaurantSearchIndex({
      client: unreachableClient,
      indexAlias: 'restaurants-unreachable',
      shouldRefreshOnWrite: false,
    });

    await expect(unreachable.save(buildSearchableRestaurant())).rejects.toThrow(
      SearchIndexUnavailableError,
    );
    await expect(unreachable.search(browseEverything)).rejects.toThrow(SearchIndexUnavailableError);
    await unreachableClient.close();
  });

  it.each([
    { answer: 'too many requests', statusCode: 429, failure: SearchIndexUnavailableError },
    { answer: 'service unavailable', statusCode: 503, failure: SearchIndexUnavailableError },
    { answer: 'bad request', statusCode: 400, failure: errors.ResponseError },
  ])(
    'reports a $answer answer of the search engine as $failure.name',
    async ({ statusCode, failure }) => {
      const searchEngine = await startSearchEngineAnswering(statusCode);
      const answeringClient = clientOf(searchEngine);
      const answering = new OpenSearchRestaurantSearchIndex({
        client: answeringClient,
        indexAlias: 'restaurants-answering',
        shouldRefreshOnWrite: false,
      });

      await expect(answering.search(browseEverything)).rejects.toThrow(failure);
      await expect(answering.save(buildSearchableRestaurant())).rejects.toThrow(failure);
      await answeringClient.close();
      searchEngine.close();
    },
  );

  it('points the alias at a fresh index after a rebuild and deletes the previous one', async () => {
    const searchIndex = await createSearchIndex();
    const indexAlias = `restaurants-${String(createdIndexCount)}`;
    await searchIndex.save(buildSearchableRestaurant());

    await searchIndex.rebuild(() => Promise.resolve([buildSearchableRestaurant()]));

    const aliased = Object.keys((await client.indices.getAlias({ name: indexAlias })).body);
    const previousExists = await client.indices.exists({ index: `${indexAlias}-initial` });
    expect(aliased).toHaveLength(1);
    expect(aliased[0]).not.toBe(`${indexAlias}-initial`);
    expect(previousExists.body).toBe(false);
  });

  it('keeps one index behind the alias when createIfMissing runs again after a rebuild', async () => {
    const searchIndex = await createSearchIndex();
    const indexAlias = `restaurants-${String(createdIndexCount)}`;
    await searchIndex.rebuild(() => Promise.resolve([]));

    await searchIndex.createIfMissing();

    const aliased = Object.keys((await client.indices.getAlias({ name: indexAlias })).body);
    expect(aliased).toHaveLength(1);
    expect(await searchIndex.save(buildSearchableRestaurant())).toBe(true);
  });

  it('waits for a rebuild instead of creating an index when the one behind the alias is lost', async () => {
    const searchIndex = await createSearchIndex();
    const indexAlias = `restaurants-${String(createdIndexCount)}`;
    await client.indices.delete({ index: `${indexAlias}-initial` });

    await expect(searchIndex.save(buildSearchableRestaurant())).rejects.toThrow(
      SearchIndexUnavailableError,
    );
    await expect(searchIndex.search(browseEverything)).rejects.toThrow(SearchIndexUnavailableError);
    const isIndexCreated = (await client.indices.exists({ index: indexAlias })).body;
    await searchIndex.rebuild(() => Promise.resolve([buildSearchableRestaurant()]));

    const results = await searchIndex.search(browseEverything);
    const indices = Object.keys((await client.indices.get({ index: `${indexAlias}-*` })).body);
    expect(isIndexCreated).toBe(false);
    expect(results.hits).toHaveLength(1);
    expect(indices).toHaveLength(1);
  });

  it('escapes the markup of a name it highlights', async () => {
    const searchIndex = await createSearchIndex();
    await searchIndex.save(
      buildSearchableRestaurant({ name: 'Pizzaria <img src=x onerror=alert(1)>' }),
    );

    const results = await searchIndex.search({ ...browseEverything, text: 'pizzaria' });

    expect(results.hits.map((hit) => hit.highlights)).toEqual([
      ['<em>Pizzaria</em> &lt;img src=x onerror=alert(1)&gt;'],
    ]);
  });

  it('answers a restaurant whose time zone the search engine does not know as closed', async () => {
    const searchIndex = await createSearchIndex();
    const restaurant = buildSearchableRestaurant();
    await client.index({
      index: `restaurants-${String(createdIndexCount)}`,
      id: restaurant.restaurantId,
      body: {
        ...restaurantSearchDocumentPersistenceMapper.toDocument(restaurant),
        timeZone: 'Mars/Olympus',
      },
      refresh: true,
    });

    const results = await searchIndex.search(browseEverything);

    expect(results.hits.map((hit) => hit.isOpenNow)).toEqual([false]);
  });
});

describe('OpenSearchRestaurantSearchIndex relevance', () => {
  let searchIndex: OpenSearchRestaurantSearchIndex;

  async function namesFoundBy(search: Partial<RestaurantSearch>): Promise<readonly string[]> {
    const results = await searchIndex.search({ ...browseEverything, ...search });
    return results.hits.map((hit) => hit.name);
  }

  beforeAll(async () => {
    searchIndex = await createSearchIndex();
    const restaurants = [
      {
        restaurantId: '0199a5d0-0000-7000-8000-0000000001a1',
        name: 'Cantina Leonardo',
        menuItems: [
          {
            menuItemId: '0199a5d0-0000-7000-8000-000000000d09',
            name: 'Moqueca',
            priceInCents: 8900n,
            isAvailable: true,
          },
        ],
      },
      {
        restaurantId: '0199a5d0-0000-7000-8000-0000000001a2',
        name: 'Açaí da Praia',
        category: 'Sobremesas',
      },
      {
        restaurantId: '0199a5d0-0000-7000-8000-0000000001a3',
        name: 'X-Burger do Zé',
        category: 'Lanches',
      },
      { restaurantId: '0199a5d0-0000-7000-8000-0000000001a4', name: 'Pizzaria Bella' },
      {
        restaurantId: '0199a5d0-0000-7000-8000-0000000001a5',
        name: 'Sushi Bar',
        category: 'Japonesa',
      },
    ];
    for (const restaurant of restaurants) {
      await searchIndex.save(buildSearchableRestaurant(restaurant));
    }
  });

  it.each([
    { typed: 'leoanrdo', expected: 'Cantina Leonardo', rule: 'a transposition in a long word' },
    { typed: 'suhsi', expected: 'Sushi Bar', rule: 'a transposition in a short word' },
    { typed: 'acai', expected: 'Açaí da Praia', rule: 'accents folded on both sides' },
    { typed: 'ac', expected: 'Açaí da Praia', rule: 'accents folded while typing' },
    { typed: 'hamburguer', expected: 'X-Burger do Zé', rule: 'a synonym' },
    { typed: 'pizz', expected: 'Pizzaria Bella', rule: 'a prefix while typing' },
  ])('finds $expected by "$typed" through $rule', async ({ typed, expected }) => {
    expect(await namesFoundBy({ text: typed })).toEqual([expected]);
  });

  it('keeps the first letter of a word exact', async () => {
    expect(await namesFoundBy({ text: 'zella' })).toEqual([]);
  });

  it('finds the restaurant that sells a dish and marks the matched fragment', async () => {
    const results = await searchIndex.search({ ...browseEverything, text: 'moqueca' });

    expect(results.hits.map(({ name, highlights }) => ({ name, highlights }))).toEqual([
      { name: 'Cantina Leonardo', highlights: ['<em>Moqueca</em>'] },
    ]);
  });

  it('suggests the corrected spelling of a misspelled query', async () => {
    const results = await searchIndex.search({ ...browseEverything, text: 'pizaria bela' });

    expect(results.suggestion).toBe('pizzaria bella');
  });
});

describe('OpenSearchRestaurantSearchIndex ranking', () => {
  let searchIndex: OpenSearchRestaurantSearchIndex;
  const farOpenId = '0199a5d0-0000-7000-8000-0000000002a1';
  const nearClosedId = '0199a5d0-0000-7000-8000-0000000002a2';
  const nearOpenId = '0199a5d0-0000-7000-8000-0000000002a3';

  beforeAll(async () => {
    searchIndex = await createSearchIndex();
    await searchIndex.save(
      buildSearchableRestaurant({
        restaurantId: farOpenId,
        name: 'Pizzaria Roma',
        location: { latitude: -23.65, longitude: -46.7 },
      }),
    );
    await searchIndex.save(
      buildSearchableRestaurant({
        restaurantId: nearClosedId,
        name: 'Pizzaria Roma',
        openingHours: [{ dayOfWeek: 'MONDAY', opensAt: '11:00', closesAt: '15:00' }],
      }),
    );
    await searchIndex.save(
      buildSearchableRestaurant({ restaurantId: nearOpenId, name: 'Pizzaria Roma' }),
    );
  });

  it('ranks open restaurants above a closed one nearby, the nearer open one first', async () => {
    const results = await searchIndex.search({
      ...browseEverything,
      text: 'roma',
      origin: paulista,
    });

    expect(results.hits.map((hit) => hit.restaurantId)).toEqual([
      nearOpenId,
      farOpenId,
      nearClosedId,
    ]);
  });
});
