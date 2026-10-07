import { describe, expect, it } from 'vitest';
import {
  createRestaurantApi,
  listMemberships,
  onboardRestaurant,
  problemOf,
  readRestaurant,
  reviseMenu,
  type Onboarding,
  type RestaurantApi,
  type RestaurantView,
} from './restaurant-api.adapter.ts';

interface Answer {
  readonly status: number;
  readonly body?: object;
}

const restaurantId = '0199a5d0-0000-7000-8000-0000000000b1';
const onboarding: Onboarding = {
  name: 'Cantina Nonna',
  category: 'Italian',
  address: {
    street: 'Rua Augusta',
    number: '1500',
    city: 'Sao Paulo',
    postalCode: '01304-001',
    location: { latitude: -23.5614, longitude: -46.6559 },
  },
  timeZone: 'America/Sao_Paulo',
  openingHours: [{ dayOfWeek: 'MONDAY', opensAt: '11:00', closesAt: '23:00' }],
  minimumOrderInCents: '2000',
};
const lasagna = {
  menuItemId: '0199a5d0-0000-7000-8000-000000000e01',
  name: 'Lasagna',
  priceInCents: '3990',
  isAvailable: true,
};
const restaurant: RestaurantView = {
  ...onboarding,
  restaurantId,
  version: 2,
  currency: 'BRL',
  menuItems: [lasagna],
};

class FakeEdge {
  readonly requests: Request[] = [];
  readonly #answer: Answer;

  constructor(answer: Answer) {
    this.#answer = answer;
  }

  api(): RestaurantApi {
    const api = createRestaurantApi('http://portal.test', 'access-token-of-staff-a');
    api.use({
      onRequest: ({ request }) => {
        this.requests.push(request.clone());
        const { status, body } = this.#answer;
        const contentType = status >= 400 ? 'application/problem+json' : 'application/json';
        const headers =
          body === undefined ? { 'content-length': '0' } : { 'content-type': contentType };
        return new Response(body === undefined ? null : JSON.stringify(body), { status, headers });
      },
    });
    return api;
  }
}

function problem(status: number, title: string, reason?: string): Answer {
  return {
    status,
    body: { type: 'about:blank', title, status, ...(reason === undefined ? {} : { reason }) },
  };
}

describe('the restaurant API adapter', () => {
  it('sends the access token of the staff member as a bearer token', async () => {
    const edge = new FakeEdge({ status: 200, body: { memberships: [] } });

    await listMemberships(edge.api());

    expect(edge.requests.map((request) => request.headers.get('authorization'))).toEqual([
      'Bearer access-token-of-staff-a',
    ]);
  });

  it('lists the restaurants of the staff member', async () => {
    const memberships = [{ restaurantId, restaurantName: 'Cantina Nonna', role: 'OWNER' }];
    const edge = new FakeEdge({ status: 200, body: { memberships } });

    await expect(listMemberships(edge.api())).resolves.toEqual({ memberships });
    expect(edge.requests.map((request) => request.url)).toEqual([
      'http://portal.test/v1/restaurant/memberships',
    ]);
  });

  it('posts the onboarding and answers the new restaurant id', async () => {
    const edge = new FakeEdge({ status: 201, body: { restaurantId } });

    await expect(onboardRestaurant(edge.api(), onboarding)).resolves.toEqual({ restaurantId });
    const [request] = edge.requests;
    expect(request?.method).toBe('POST');
    expect(request?.url).toBe('http://portal.test/v1/restaurant/restaurants');
    expect(await request?.json()).toEqual(onboarding);
  });

  it('reads the restaurant the staff member opened', async () => {
    const edge = new FakeEdge({ status: 200, body: restaurant });

    await expect(readRestaurant(edge.api(), restaurantId)).resolves.toEqual(restaurant);
    expect(edge.requests.map((request) => request.url)).toEqual([
      `http://portal.test/v1/restaurant/restaurants/${restaurantId}`,
    ]);
  });

  it('puts the whole menu of the restaurant and answers its new version', async () => {
    const edge = new FakeEdge({ status: 200, body: { version: 3 } });

    await expect(reviseMenu(edge.api(), restaurantId, [lasagna])).resolves.toEqual({
      version: 3,
    });
    const [request] = edge.requests;
    expect(request?.method).toBe('PUT');
    expect(request?.url).toBe(`http://portal.test/v1/restaurant/restaurants/${restaurantId}/menu`);
    expect(await request?.json()).toEqual({ menuItems: [lasagna] });
  });

  it.each([
    [
      'a refusal reason',
      problem(400, 'Bad Request', 'InvalidOpeningPeriod'),
      'Check the opening hours.',
    ],
    [
      'the bare 403 a staff member of another restaurant gets',
      problem(403, 'Forbidden'),
      'Your account may not open this restaurant.',
    ],
    [
      'a token the edge refused',
      problem(401, 'Unauthorized'),
      'Your session ended. Reload the page to sign in again.',
    ],
    ['a busy edge without a body', { status: 503 }, 'The service is busy. Try again in a moment.'],
  ])('describes %s', async (description, answer, expected) => {
    const edge = new FakeEdge(answer);

    await expect(readRestaurant(edge.api(), restaurantId)).resolves.toEqual({ problem: expected });
  });

  it('describes a lost menu revision race', async () => {
    const edge = new FakeEdge(problem(409, 'Conflict', 'ConcurrentMenuRevision'));

    await expect(reviseMenu(edge.api(), restaurantId, [lasagna])).resolves.toEqual({
      problem: 'Someone else revised the menu meanwhile. Reload the page to see it.',
    });
  });

  it.each([
    ['lists the memberships', (api: RestaurantApi) => listMemberships(api)],
    ['onboards a restaurant', (api: RestaurantApi) => onboardRestaurant(api, onboarding)],
    ['reads a restaurant', (api: RestaurantApi) => readRestaurant(api, restaurantId)],
    ['revises a menu', (api: RestaurantApi) => reviseMenu(api, restaurantId, [lasagna])],
  ])('describes a refusal by its reason when it %s', async (description, call) => {
    const edge = new FakeEdge(problem(400, 'Bad Request', 'InvalidOpeningPeriod'));

    await expect(call(edge.api())).resolves.toEqual({ problem: 'Check the opening hours.' });
  });

  it.each([
    [{ problem: 'This restaurant does not exist.' }, 'This restaurant does not exist.'],
    [{ restaurantId }, undefined],
    [undefined, undefined],
  ])('reads the problem of %j', (result, expected) => {
    expect(problemOf(result)).toBe(expected);
  });
});
