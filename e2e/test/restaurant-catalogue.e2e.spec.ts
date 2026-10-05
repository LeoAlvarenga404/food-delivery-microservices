import { randomBytes, randomUUID } from 'node:crypto';
import { beforeAll, describe, expect, it } from 'vitest';
import { HttpCatalogueApi } from './support/http-catalogue-api.adapter.ts';
import {
  HttpRestaurantApi,
  pizzeriaMenu,
  pizzeriaOnboarding,
} from './support/http-restaurant-api.adapter.ts';

const edgeUrl = process.env['E2E_EDGE_URL'] ?? 'http://127.0.0.1:8080';
const staffAApi = new HttpRestaurantApi('staff-a');
const catalogue = new HttpCatalogueApi();

const letters = 'abcdefghijklmnopqrstuvwxyz';

function randomLetters(count: number): string {
  return Array.from(randomBytes(count), (byte) => letters.charAt(byte % letters.length)).join('');
}

beforeAll(() => staffAApi.waitUntilReachable());

describe('restaurant catalogue', () => {
  it('finds a restaurant without a token by a dish of its revised menu, even misspelled', async () => {
    const dishWord = `${randomLetters(1)}ab${randomLetters(7)}`;
    const misspelledDishWord = `${dishWord.charAt(0)}ba${dishWord.slice(3)}`;
    const restaurantId = await staffAApi.onboardPizzeria();
    const revised = await staffAApi.reviseMenu(restaurantId, [
      { ...pizzeriaMenu[0], name: `Torta ${dishWord}` },
    ]);
    expect(revised.status).toBe(200);

    const found = await catalogue.waitForHit(dishWord, restaurantId);
    const foundMisspelled = await catalogue.waitForHit(misspelledDishWord, restaurantId);

    expect(found).toMatchObject({ restaurantId, name: 'Pizzaria Bella', category: 'Pizza' });
    expect(found.highlights).toContain(`Torta <em>${dishWord}</em>`);
    expect(foundMisspelled.restaurantId).toBe(restaurantId);
  });

  it('serves the public restaurant with its version as the entity tag and 304 until it changes', async () => {
    const restaurantId = await staffAApi.onboardPizzeria();
    await staffAApi.reviseMenu(restaurantId, pizzeriaMenu);

    const first = await catalogue.fetchRestaurant(restaurantId);
    const unchanged = await catalogue.fetchRestaurant(restaurantId, '"2"');
    await staffAApi.reviseMenu(restaurantId, [{ ...pizzeriaMenu[0], priceInCents: '5000' }]);
    const changed = await catalogue.fetchRestaurant(restaurantId, '"2"');

    expect(first.status).toBe(200);
    expect(first.headers.get('etag')).toBe('"2"');
    expect(await first.json()).toMatchObject({
      restaurantId,
      version: 2,
      ...pizzeriaOnboarding,
      currency: 'BRL',
      menuItems: pizzeriaMenu,
    });
    expect(unchanged.status).toBe(304);
    expect(unchanged.headers.get('etag')).toBe('"2"');
    expect(await unchanged.text()).toBe('');
    expect(changed.status).toBe(200);
    expect(changed.headers.get('etag')).toBe('"3"');
    expect(await changed.json()).toMatchObject({
      version: 3,
      menuItems: [{ ...pizzeriaMenu[0], priceInCents: '5000' }],
    });
  });

  it('answers the catalogue without a token while orders and other methods still need one', async () => {
    const search = await catalogue.searchRestaurants({ text: 'pizza' });
    const searchWithControlCharacter = await catalogue.searchRestaurants({ text: 'pizza\u0007' });
    const unknownRestaurant = await catalogue.fetchRestaurant(randomUUID());
    const order = await fetch(`${edgeUrl}/v1/orders/${randomUUID()}`);
    const restaurantPost = await fetch(`${edgeUrl}/v1/restaurants`, { method: 'POST' });
    const nestedRestaurantPath = await fetch(`${edgeUrl}/v1/restaurants/${randomUUID()}/orders`);
    const upperCaseOrderPath = await fetch(`${edgeUrl}/V1/orders/${randomUUID()}`);
    const escapedSlashPath = await fetch(`${edgeUrl}/v1/restaurants/${randomUUID()}%2Forders`);

    expect(search.status).toBe(200);
    expect(search.headers.get('x-correlation-id')).not.toBeNull();
    expect(searchWithControlCharacter.status).toBe(400);
    expect(await searchWithControlCharacter.json()).toEqual({
      type: 'about:blank',
      title: 'Bad Request',
      status: 400,
      reason: 'InvalidSearchCriteria',
    });
    expect(unknownRestaurant.status).toBe(404);
    expect(await unknownRestaurant.json()).toEqual({
      type: 'about:blank',
      title: 'Not Found',
      status: 404,
    });
    for (const refused of [order, restaurantPost, nestedRestaurantPath, upperCaseOrderPath]) {
      expect(refused.status).toBe(401);
      expect(refused.headers.get('x-correlation-id')).toBeNull();
    }
    expect(escapedSlashPath.status).toBe(400);
    expect(escapedSlashPath.headers.get('x-correlation-id')).toBeNull();
  });
});
