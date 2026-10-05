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

export type CatalogueHit = z.infer<typeof searchResultsSchema>['restaurants'][number];

export class HttpCatalogueApi {
  readonly #baseUrl: string;

  constructor(baseUrl = process.env['E2E_EDGE_URL'] ?? 'http://127.0.0.1:8080') {
    this.#baseUrl = baseUrl;
  }

  searchRestaurants(query: Record<string, string>): Promise<Response> {
    return fetch(`${this.#baseUrl}/v1/restaurants?${new URLSearchParams(query).toString()}`);
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
      const response = await this.searchRestaurants({ text, limit: '50' });
      const results = searchResultsSchema.parse(await response.json());
      const hit = results.restaurants.find((found) => found.restaurantId === restaurantId);
      if (hit !== undefined) return hit;
      await delay(pollIntervalInMilliseconds);
    }
    throw new Error(`${restaurantId} was not found by "${text}" within the time limit`);
  }
}
