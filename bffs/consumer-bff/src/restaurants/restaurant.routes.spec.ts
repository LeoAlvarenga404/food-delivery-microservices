import { Code, ConnectError } from '@connectrpc/connect';
import { createLogger } from '@fd/chassis-observability';
import { SearchRestaurantsFailureSchema } from '@fd/contracts/fooddelivery/restaurant/v1/catalogue_pb.js';
import type { LightMyRequestResponse } from 'fastify';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { FakeConsumerService } from '../../test/support/consumer-service.fake.ts';
import { FakeOrderService } from '../../test/support/order-service.fake.ts';
import {
  cantinaId,
  FakeRestaurantCatalogueService,
} from '../../test/support/restaurant-catalogue-service.fake.ts';
import { fakeServiceAccess } from '../../test/support/service-access.fake.ts';
import { createConsumerBffServer, type ConsumerBffServer } from '../main.ts';

const callerCorrelationId = '0199a5d0-0000-7000-8000-0000000000e2';
const pizzeriaId = '0199a5d0-0000-7000-8000-0000000000b1';

let catalogue: FakeRestaurantCatalogueService;
let server: ConsumerBffServer;

function get(url: string, headers: Record<string, string> = {}): Promise<LightMyRequestResponse> {
  return server.inject({ method: 'GET', url, headers });
}

beforeEach(async () => {
  catalogue = new FakeRestaurantCatalogueService();
  server = await createConsumerBffServer({
    orderService: new FakeOrderService().client(),
    consumerService: new FakeConsumerService().client(),
    restaurantCatalogueService: catalogue.client(),
    serviceAccess: fakeServiceAccess,
    logger: createLogger({ serviceName: 'consumer-bff', level: 'silent' }),
    generateCorrelationId: () => '0199a5d0-0000-7000-8000-0000000000e9',
  });
});

afterEach(() => server.close());

describe('GET /v1/restaurants', () => {
  it('searches the catalogue without a token and answers hits, category counts and a suggestion', async () => {
    catalogue.searchResponse = {
      hits: [
        {
          restaurantId: cantinaId,
          name: 'Cantina Nonna',
          category: 'Italiana',
          isOpenNow: false,
          highlights: ['<em>Cantina</em> Nonna'],
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
        { category: 'Pizza', restaurantCount: 4 },
        { category: 'Italiana', restaurantCount: 2 },
      ],
      suggestion: 'cantina nonna',
    };

    const response = await get(
      '/v1/restaurants?text=cantna&category=Italiana&latitude=-23.55&longitude=-46.63&radiusInKilometers=3.5&limit=7',
      { 'x-correlation-id': callerCorrelationId },
    );

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({
      restaurants: [
        {
          restaurantId: cantinaId,
          name: 'Cantina Nonna',
          category: 'Italiana',
          isOpenNow: false,
          highlights: ['<em>Cantina</em> Nonna'],
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
        { category: 'Pizza', restaurantCount: 4 },
        { category: 'Italiana', restaurantCount: 2 },
      ],
      suggestion: 'cantina nonna',
    });
    expect(catalogue.searchRequests).toMatchObject([
      {
        text: 'cantna',
        category: 'Italiana',
        origin: { latitude: -23.55, longitude: -46.63 },
        radiusInKilometers: 3.5,
        limit: 7,
      },
    ]);
    expect(catalogue.receivedCorrelationIds).toEqual([callerCorrelationId]);
    expect(catalogue.receivedAuthorizations).toEqual([null]);
  });

  it('searches everything with twenty results by default and leaves out an empty suggestion', async () => {
    const response = await get('/v1/restaurants', { authorization: 'Bearer staff-token' });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ restaurants: [], categories: [] });
    expect(catalogue.searchRequests).toMatchObject([
      { text: '', category: '', radiusInKilometers: 0, limit: 20 },
    ]);
    expect(catalogue.searchRequests[0]?.origin).toBeUndefined();
    expect(catalogue.receivedAuthorizations).toEqual([null]);
  });

  it.each([
    { problem: 'a latitude without a longitude', query: 'latitude=-23.55' },
    { problem: 'a longitude without a latitude', query: 'longitude=-46.63' },
    { problem: 'a latitude that is not a number', query: 'latitude=north&longitude=-46.63' },
    { problem: 'a limit above fifty', query: 'limit=51' },
    { problem: 'a limit of zero', query: 'limit=0' },
    { problem: 'a text above one hundred characters', query: `text=${'a'.repeat(101)}` },
    { problem: 'a category above fifty characters', query: `category=${'c'.repeat(51)}` },
  ])('refuses $problem with a bad request problem before searching', async ({ query }) => {
    const response = await get(`/v1/restaurants?${query}`);

    expect(response.statusCode).toBe(400);
    expect(response.json()).toMatchObject({
      type: 'about:blank',
      title: 'Bad Request',
      status: 400,
    });
    expect(catalogue.searchRequests).toEqual([]);
  });

  it('answers the reason the restaurant service gives for refusing a search', async () => {
    catalogue.failure = new ConnectError('InvalidSearchCriteria', Code.InvalidArgument, undefined, [
      { desc: SearchRestaurantsFailureSchema, value: { reason: 'InvalidSearchCriteria' } },
    ]);

    const response = await get('/v1/restaurants?text=pizza');

    expect(response.statusCode).toBe(400);
    expect(response.json()).toEqual({
      type: 'about:blank',
      title: 'Bad Request',
      status: 400,
      reason: 'InvalidSearchCriteria',
    });
  });

  it('answers a search engine outage with a service unavailable problem', async () => {
    catalogue.failure = new ConnectError('search index unavailable', Code.Unavailable);

    const response = await get('/v1/restaurants?text=pizza');

    expect(response.statusCode).toBe(503);
    expect(response.json()).toEqual({
      type: 'about:blank',
      title: 'Service Unavailable',
      status: 503,
    });
  });
});

describe('GET /v1/restaurants/:restaurantId', () => {
  it('answers the public restaurant without a token, with its version as the entity tag', async () => {
    const response = await get(`/v1/restaurants/${cantinaId}`, {
      authorization: 'Bearer staff-token',
    });

    expect(response.statusCode).toBe(200);
    expect(response.headers.etag).toBe('"7"');
    expect(response.json()).toEqual({
      restaurantId: cantinaId,
      version: 7,
      name: 'Cantina Nonna',
      category: 'Italiana',
      address: {
        street: 'Rua Augusta',
        number: '500',
        city: 'Sao Paulo',
        postalCode: '01305-000',
        location: { latitude: -23.5505, longitude: -46.6333 },
      },
      timeZone: 'America/Manaus',
      openingHours: [
        { dayOfWeek: 'TUESDAY', opensAt: '11:30', closesAt: '15:00' },
        { dayOfWeek: 'SUNDAY', opensAt: '19:00', closesAt: '01:00' },
      ],
      minimumOrderInCents: '3500',
      currency: 'BRL',
      menuItems: [
        {
          menuItemId: '0199a5d0-0000-7000-8000-000000000d07',
          name: 'Lasanha',
          priceInCents: '9007199254740993',
          isAvailable: true,
        },
        {
          menuItemId: '0199a5d0-0000-7000-8000-000000000d08',
          name: 'Tiramisu',
          priceInCents: '2100',
          isAvailable: false,
        },
      ],
    });
    expect(catalogue.receivedAuthorizations).toEqual([null]);
  });

  it.each(['"7"', 'W/"7"', '"6", "7"', '*'])(
    'answers not modified without a body when If-None-Match is %s',
    async (ifNoneMatch) => {
      const response = await get(`/v1/restaurants/${cantinaId}`, { 'if-none-match': ifNoneMatch });

      expect(response.statusCode).toBe(304);
      expect(response.headers.etag).toBe('"7"');
      expect(response.body).toBe('');
    },
  );

  it.each(['"6"', '"77"', '7'])(
    'answers the restaurant when If-None-Match is %s, another version',
    async (ifNoneMatch) => {
      const response = await get(`/v1/restaurants/${cantinaId}`, { 'if-none-match': ifNoneMatch });

      expect(response.statusCode).toBe(200);
      expect(response.json()).toMatchObject({ restaurantId: cantinaId, version: 7 });
    },
  );

  it('answers a restaurant that was never onboarded with a not found problem', async () => {
    const response = await get(`/v1/restaurants/${pizzeriaId}`);

    expect(response.statusCode).toBe(404);
    expect(response.json()).toEqual({ type: 'about:blank', title: 'Not Found', status: 404 });
  });

  it('refuses a restaurant id that is not a uuid before calling the restaurant service', async () => {
    const response = await get('/v1/restaurants/pizzaria-bella');

    expect(response.statusCode).toBe(400);
    expect(catalogue.receivedCorrelationIds).toEqual([]);
  });
});
