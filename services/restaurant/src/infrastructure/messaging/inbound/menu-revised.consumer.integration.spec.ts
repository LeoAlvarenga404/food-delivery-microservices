import { Writable } from 'node:stream';
import {
  PermanentMessageFailure,
  TransientMessageFailure,
  type MessageHandler,
} from '@fd/chassis-kafka';
import { createLogger, type Logger } from '@fd/chassis-observability';
import { startOpenSearchContainer, type StartedOpenSearch } from '@fd/chassis-testing';
import { Client } from '@opensearch-project/opensearch';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import {
  buildMenuRevisedMessage,
  menuRevisedOf,
} from '../../../../test/support/menu-revised-message.builder.ts';
import { buildSearchableRestaurant } from '../../../../test/support/searchable-restaurant.builder.ts';
import { OpenSearchRestaurantSearchIndex } from '#infrastructure/search/open-search-restaurant-search-index.adapter.ts';
import { menuRevisedConsumer } from './menu-revised.consumer.ts';

let openSearch: StartedOpenSearch;
let client: Client;
let searchIndex: OpenSearchRestaurantSearchIndex;
let handleMenuRevision: MessageHandler;
let logEntries: Record<string, unknown>[];
let createdIndexCount = 0;

function captureLogger(): Logger {
  const destination = new Writable({
    write(chunk: Buffer, encoding, callback) {
      const parsed: unknown = JSON.parse(chunk.toString());
      logEntries.push(typeof parsed === 'object' && parsed !== null ? { ...parsed } : {});
      callback();
    },
  });
  return createLogger({ serviceName: 'restaurant-service', level: 'info' }, destination);
}

async function namesFoundBy(text: string): Promise<readonly string[]> {
  const results = await searchIndex.search({
    text,
    category: undefined,
    origin: undefined,
    radiusInKilometers: undefined,
    limit: 20,
    searchedAt: new Date('2026-10-02T21:30:00.000Z'),
  });
  return results.hits.map((hit) => hit.name);
}

function revisionOf(name: string, version: number): ReturnType<typeof buildMenuRevisedMessage> {
  return buildMenuRevisedMessage(menuRevisedOf(buildSearchableRestaurant({ name, version })));
}

beforeAll(async () => {
  openSearch = await startOpenSearchContainer();
  client = new Client({ node: openSearch.url });
});

afterAll(async () => {
  await client.close();
  await openSearch.stop();
});

beforeEach(async () => {
  createdIndexCount += 1;
  searchIndex = new OpenSearchRestaurantSearchIndex({
    client,
    indexAlias: `restaurants-${String(createdIndexCount)}`,
    shouldRefreshOnWrite: true,
  });
  await searchIndex.createIfMissing();
  logEntries = [];
  handleMenuRevision = menuRevisedConsumer({ searchIndex, logger: captureLogger() });
});

describe('menuRevisedConsumer', () => {
  it('projects a snapshot into the search index and logs its restaurant and version', async () => {
    await handleMenuRevision(revisionOf('Pizzaria Bella', 1));

    expect(await namesFoundBy('bella')).toEqual(['Pizzaria Bella']);
    expect(logEntries).toContainEqual(
      expect.objectContaining({
        msg: 'restaurant projected',
        restaurantId: '0199a5d0-0000-7000-8000-0000000000b1',
        version: 1,
      }),
    );
  });

  it('ignores a redelivered snapshot and logs it as ignored', async () => {
    await handleMenuRevision(revisionOf('Pizzaria Bella', 2));

    await handleMenuRevision(revisionOf('Pizzaria Repetida', 2));

    expect(await namesFoundBy('repetida')).toEqual([]);
    expect(logEntries.at(-1)).toEqual(
      expect.objectContaining({ msg: 'restaurant projection ignored', version: 2 }),
    );
  });

  it('ignores an older snapshot that arrives after a newer one', async () => {
    await handleMenuRevision(revisionOf('Pizzaria Nova', 3));

    await handleMenuRevision(revisionOf('Pizzaria Antiga', 2));

    expect(await namesFoundBy('pizzaria')).toEqual(['Pizzaria Nova']);
  });

  it('asks for a retry, never a dead letter, while the search engine is unreachable', async () => {
    const unreachableClient = new Client({ node: 'http://127.0.0.1:9', maxRetries: 0 });
    const handleWhileUnreachable = menuRevisedConsumer({
      searchIndex: new OpenSearchRestaurantSearchIndex({
        client: unreachableClient,
        indexAlias: 'restaurants-unreachable',
        shouldRefreshOnWrite: false,
      }),
      logger: captureLogger(),
    });

    await expect(handleWhileUnreachable(revisionOf('Pizzaria Bella', 1))).rejects.toThrow(
      TransientMessageFailure,
    );
    await unreachableClient.close();
  });

  it('dead-letters a snapshot it cannot read and leaves the index as it was', async () => {
    await handleMenuRevision(revisionOf('Pizzaria Bella', 1));
    const unreadable = { ...revisionOf('Pizzaria Bella', 2), payload: new Uint8Array([0xff]) };

    await expect(handleMenuRevision(unreadable)).rejects.toThrow(PermanentMessageFailure);
    expect(await namesFoundBy('bella')).toEqual(['Pizzaria Bella']);
  });
});
