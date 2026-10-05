import { createServer, type Server } from 'node:http';
import { startOpenSearchContainer, type StartedOpenSearch } from '@fd/chassis-testing';
import { Client, errors } from '@opensearch-project/opensearch';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { describeRestaurantSearchIndexContract } from '../../../test/support/restaurant-search-index.contract.ts';
import { buildSearchableRestaurant } from '../../../test/support/searchable-restaurant.builder.ts';
import {
  SearchIndexUnavailableError,
  type RestaurantSearch,
} from '#application/ports/restaurant-search-index.port.ts';
import { OpenSearchRestaurantSearchIndex } from './open-search-restaurant-search-index.adapter.ts';

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
});
