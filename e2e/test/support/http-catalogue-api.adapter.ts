import { setTimeout as delay } from 'node:timers/promises';
import { z } from 'zod';

const searchResultsSchema = z.object({
  restaurants: z.array(
    z.object({
      restaurantId: z.uuid(),
      name: z.string(),
      category: z.string(),
      isOpenNow: z.boolean(),
      highlights: z.array(z.string()),
    }),
  ),
  categories: z.array(z.object({ category: z.string(), restaurantCount: z.int() })),
  suggestion: z.string().optional(),
});
const pollIntervalInMilliseconds = 500;
const answerLimitInMilliseconds = 60_000;

export type CatalogueHit = z.infer<typeof searchResultsSchema>['restaurants'][number];

export class HttpCatalogueApi {
  readonly #baseUrl: string;

  constructor(baseUrl = process.env['E2E_EDGE_URL'] ?? 'http://127.0.0.1:8080') {
    this.#baseUrl = baseUrl;
  }

  async searchRestaurants(query: Record<string, string>): Promise<Response> {
    const deadlineInMilliseconds = Date.now() + answerLimitInMilliseconds;
    let response = await this.#search(query);
    while (response.status >= 500 && Date.now() < deadlineInMilliseconds) {
      await response.body?.cancel();
      await delay(pollIntervalInMilliseconds);
      response = await this.#search(query);
    }
    return response;
  }

  fetchRestaurant(restaurantId: string, ifNoneMatch?: string): Promise<Response> {
    return fetch(`${this.#baseUrl}/v1/restaurants/${restaurantId}`, {
      headers: ifNoneMatch === undefined ? {} : { 'if-none-match': ifNoneMatch },
    });
  }

  async waitForHit(
    text: string,
    restaurantId: string,
    limitInMilliseconds = 60_000,
  ): Promise<CatalogueHit> {
    const deadlineInMilliseconds = Date.now() + limitInMilliseconds;
    while (Date.now() < deadlineInMilliseconds) {
      const hit = await this.#findHit(text, restaurantId);
      if (hit !== undefined) return hit;
      await delay(pollIntervalInMilliseconds);
    }
    throw new Error(`${restaurantId} was not found by "${text}" within the time limit`);
  }

  #search(query: Record<string, string>): Promise<Response> {
    return fetch(`${this.#baseUrl}/v1/restaurants?${new URLSearchParams(query).toString()}`);
  }

  async #findHit(text: string, restaurantId: string): Promise<CatalogueHit | undefined> {
    const response = await this.#search({ text, limit: '50' });
    if (!response.ok) {
      await response.body?.cancel();
      return undefined;
    }
    const results = searchResultsSchema.parse(await response.json());
    return results.restaurants.find((found) => found.restaurantId === restaurantId);
  }
}
