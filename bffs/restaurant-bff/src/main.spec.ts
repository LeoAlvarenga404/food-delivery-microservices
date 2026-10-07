import { createLogger } from '@fd/chassis-observability';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { FakeRestaurantService } from '../test/support/restaurant-service.fake.ts';
import { fakeServiceAccess } from '../test/support/service-access.fake.ts';
import { createRestaurantBffServer, type RestaurantBffServer } from './main.ts';

const generatedCorrelationId = '0199a5d0-0000-7000-8000-0000000000f9';

let server: RestaurantBffServer;

beforeEach(async () => {
  server = await createRestaurantBffServer({
    restaurantService: new FakeRestaurantService().client(),
    serviceAccess: fakeServiceAccess,
    logger: createLogger({ serviceName: 'restaurant-bff', level: 'silent' }),
    generateCorrelationId: () => generatedCorrelationId,
  });
});

afterEach(() => server.close());

describe('restaurant bff server', () => {
  it('answers its health endpoint', async () => {
    const response = await server.inject({ method: 'GET', url: '/health' });

    expect(response.statusCode).toBe(200);
  });

  it('answers an unknown route with a not found problem and a correlation id', async () => {
    const response = await server.inject({ method: 'GET', url: '/v1/orders' });

    expect(response.statusCode).toBe(404);
    expect(response.headers['content-type']).toBe('application/problem+json; charset=utf-8');
    expect(response.headers['x-correlation-id']).toBe(generatedCorrelationId);
    expect(response.json()).toEqual({ type: 'about:blank', title: 'Not Found', status: 404 });
  });

  it('answers a body that is not JSON with a bad request problem', async () => {
    const response = await server.inject({
      method: 'POST',
      url: '/v1/restaurant/restaurants',
      headers: { 'content-type': 'application/json', authorization: 'Bearer staff-token' },
      payload: '{"name":',
    });

    expect(response.statusCode).toBe(400);
    expect(response.json()).toMatchObject({ title: 'Bad Request', status: 400 });
  });

  it('refuses an anonymous body that is not JSON before parsing it', async () => {
    const response = await server.inject({
      method: 'POST',
      url: '/v1/restaurant/restaurants',
      headers: { 'content-type': 'application/json' },
      payload: '{"name":',
    });

    expect(response.statusCode).toBe(401);
  });

  it('echoes the correlation id of the caller in canonical lowercase', async () => {
    const response = await server.inject({
      method: 'GET',
      url: '/health',
      headers: { 'x-correlation-id': '0199A5D0-0000-7000-8000-0000000000F2' },
    });

    expect(response.headers['x-correlation-id']).toBe('0199a5d0-0000-7000-8000-0000000000f2');
  });

  it('publishes an OpenAPI document with only the restaurant routes', async () => {
    const response = await server.inject({ method: 'GET', url: '/openapi.json' });

    const document = response.json<{ paths: object }>();
    expect(document).toMatchObject({ openapi: '3.0.3', info: { title: 'Restaurant API' } });
    expect(Object.keys(document.paths)).toEqual([
      '/v1/restaurant/restaurants',
      '/v1/restaurant/restaurants/{restaurantId}/menu',
      '/v1/restaurant/restaurants/{restaurantId}',
      '/v1/restaurant/memberships',
    ]);
  });
});
