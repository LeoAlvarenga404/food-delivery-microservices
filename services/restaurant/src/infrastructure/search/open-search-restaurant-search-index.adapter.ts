import { errors, type Client } from '@opensearch-project/opensearch';
import { v7 as generateUuidV7 } from 'uuid';
import { z } from 'zod';
import {
  SearchIndexUnavailableError,
  type RestaurantSearch,
  type RestaurantSearchIndex,
  type RestaurantSearchResults,
  type SearchableRestaurant,
} from '#application/ports/restaurant-search-index.port.ts';
import { restaurantSearchDocumentPersistenceMapper } from './restaurant-search-document.persistence-mapper.ts';
import { restaurantSearchIndexBody } from './restaurant-search-index.config.ts';
import {
  toSearchRequestBody,
  toSearchResults,
} from './restaurant-search-query.persistence-mapper.ts';

export interface OpenSearchRestaurantSearchIndexSettings {
  readonly client: Client;
  readonly indexAlias: string;
  readonly shouldRefreshOnWrite: boolean;
}

const errorBodySchema = z.object({ error: z.object({ type: z.string() }) });
const unreachableErrors = [
  errors.ConnectionError,
  errors.TimeoutError,
  errors.NoLivingConnectionsError,
];

function hasErrorType(error: unknown, errorType: string): boolean {
  if (!(error instanceof errors.ResponseError)) return false;
  const body = errorBodySchema.safeParse(error.body);
  return body.success && body.data.error.type === errorType;
}

function isUnavailable(error: unknown): boolean {
  if (unreachableErrors.some((errorClass) => error instanceof errorClass)) return true;
  if (!(error instanceof errors.ResponseError)) return false;
  if (hasErrorType(error, 'index_not_found_exception')) return true;
  return error.statusCode === 429 || error.statusCode >= 500;
}

function toSearchIndexFailure(error: unknown): unknown {
  if (!isUnavailable(error)) return error;
  return new SearchIndexUnavailableError('search index unavailable', { cause: error });
}

export class OpenSearchRestaurantSearchIndex implements RestaurantSearchIndex {
  readonly #client: Client;
  readonly #indexAlias: string;
  readonly #shouldRefreshOnWrite: boolean;

  constructor(settings: OpenSearchRestaurantSearchIndexSettings) {
    this.#client = settings.client;
    this.#indexAlias = settings.indexAlias;
    this.#shouldRefreshOnWrite = settings.shouldRefreshOnWrite;
  }

  async createIfMissing(): Promise<void> {
    const { body: hasAlias } = await this.#client.indices.existsAlias({ name: this.#indexAlias });
    if (hasAlias) return;
    await this.#createIndex(`${this.#indexAlias}-initial`, true).catch((error: unknown) => {
      if (!hasErrorType(error, 'resource_already_exists_exception')) throw error;
    });
  }

  async save(restaurant: SearchableRestaurant): Promise<boolean> {
    try {
      await this.#index(this.#indexAlias, restaurant);
      return true;
    } catch (error) {
      if (hasErrorType(error, 'version_conflict_engine_exception')) return false;
      throw toSearchIndexFailure(error);
    }
  }

  async search(search: RestaurantSearch): Promise<RestaurantSearchResults> {
    const response = await this.#client
      .search({ index: this.#indexAlias, body: toSearchRequestBody(search) })
      .catch((error: unknown) => {
        throw toSearchIndexFailure(error);
      });
    return toSearchResults(response.body);
  }

  async rebuild(loadRestaurants: () => Promise<readonly SearchableRestaurant[]>): Promise<void> {
    const nextIndex = `${this.#indexAlias}-${generateUuidV7()}`;
    await this.#createIndex(nextIndex, false);
    await this.#indexAll(nextIndex, await loadRestaurants());
    const previousIndices = await this.#indicesBehindAlias();
    await this.#client.indices.updateAliases({
      body: {
        actions: [
          ...previousIndices.map((index) => ({ remove: { index, alias: this.#indexAlias } })),
          { add: { index: nextIndex, alias: this.#indexAlias } },
        ],
      },
    });
    await this.#indexAll(this.#indexAlias, await loadRestaurants());
    if (previousIndices.length > 0) await this.#client.indices.delete({ index: previousIndices });
  }

  async #createIndex(index: string, isAliased: boolean): Promise<void> {
    const aliases = isAliased ? { [this.#indexAlias]: {} } : {};
    await this.#client.indices.create({ index, body: { ...restaurantSearchIndexBody, aliases } });
  }

  async #index(index: string, restaurant: SearchableRestaurant): Promise<void> {
    await this.#client.index({
      index,
      id: restaurant.restaurantId,
      version: restaurant.version,
      version_type: 'external',
      require_alias: index === this.#indexAlias,
      body: restaurantSearchDocumentPersistenceMapper.toDocument(restaurant),
      refresh: this.#shouldRefreshOnWrite,
    });
  }

  async #indexAll(index: string, restaurants: readonly SearchableRestaurant[]): Promise<void> {
    for (const restaurant of restaurants) {
      await this.#index(index, restaurant).catch((error: unknown) => {
        if (!hasErrorType(error, 'version_conflict_engine_exception')) throw error;
      });
    }
    await this.#client.indices.refresh({ index });
  }

  async #indicesBehindAlias(): Promise<string[]> {
    const { body: hasAlias } = await this.#client.indices.existsAlias({ name: this.#indexAlias });
    if (!hasAlias) return [];
    const response = await this.#client.indices.getAlias({ name: this.#indexAlias });
    return Object.keys(response.body);
  }
}
