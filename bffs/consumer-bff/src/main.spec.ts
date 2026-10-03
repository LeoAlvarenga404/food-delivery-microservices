import { createLogger } from '@fd/chassis-observability';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { FakeOrderService } from '../test/support/order-service.fake.ts';
import { createConsumerBffServer, type ConsumerBffServer } from './main.ts';

const generatedCorrelationId = '0199a5d0-0000-7000-8000-0000000000e9';

let server: ConsumerBffServer;

beforeEach(async () => {
  server = await createConsumerBffServer({
    orderService: new FakeOrderService().client(),
    logger: createLogger({ serviceName: 'consumer-bff', level: 'silent' }),
    generateCorrelationId: () => generatedCorrelationId,
  });
});

afterEach(() => server.close());

describe('consumer bff server', () => {
  it('answers its health endpoint', async () => {
    const response = await server.inject({ method: 'GET', url: '/health' });

    expect(response.statusCode).toBe(200);
  });

  it('answers an unknown route with a not found problem', async () => {
    const response = await server.inject({ method: 'GET', url: '/v1/menus' });

    expect(response.statusCode).toBe(404);
    expect(response.headers['content-type']).toBe('application/problem+json; charset=utf-8');
    expect(response.json()).toEqual({ type: 'about:blank', title: 'Not Found', status: 404 });
  });

  it('answers a body that is not JSON with a bad request problem', async () => {
    const response = await server.inject({
      method: 'POST',
      url: '/v1/orders',
      headers: { 'content-type': 'application/json' },
      payload: '{"restaurantId":',
    });

    expect(response.statusCode).toBe(400);
    expect(response.json()).toMatchObject({ title: 'Bad Request', status: 400 });
  });

  it('echoes the correlation id of the caller in canonical lowercase', async () => {
    const response = await server.inject({
      method: 'GET',
      url: '/health',
      headers: { 'x-correlation-id': '0199A5D0-0000-7000-8000-0000000000E2' },
    });

    expect(response.headers['x-correlation-id']).toBe('0199a5d0-0000-7000-8000-0000000000e2');
  });

  it('replaces a correlation id that is not a uuid with a generated one', async () => {
    const response = await server.inject({
      method: 'GET',
      url: '/health',
      headers: { 'x-correlation-id': 'not-a-uuid' },
    });

    expect(response.headers['x-correlation-id']).toBe(generatedCorrelationId);
  });

  it('echoes the correlation id on a problem', async () => {
    const response = await server.inject({ method: 'POST', url: '/v1/orders', payload: {} });

    expect(response.statusCode).toBe(400);
    expect(response.headers['x-correlation-id']).toBe(generatedCorrelationId);
  });

  it('publishes an OpenAPI document generated from the route schemas', async () => {
    const response = await server.inject({ method: 'GET', url: '/openapi.json' });

    const document: unknown = response.json();
    expect(document).toMatchObject({
      openapi: '3.0.3',
      info: { title: 'Consumer API' },
      paths: {
        '/v1/orders': {
          post: {
            parameters: [
              { in: 'header', name: 'idempotency-key', required: true },
              { in: 'header', name: 'x-consumer-id', required: true },
            ],
            requestBody: {
              content: {
                'application/json': {
                  schema: {
                    required: ['restaurantId', 'lineItems', 'deliveryAddress', 'paymentToken'],
                  },
                },
              },
            },
            responses: {
              201: { content: { 'application/json': {} } },
              '4XX': { content: { 'application/problem+json': {} } },
              '5XX': { content: { 'application/problem+json': {} } },
            },
          },
        },
        '/v1/orders/{orderId}': {
          get: {
            parameters: [{ in: 'path', name: 'orderId', required: true }],
            responses: { 200: { content: { 'application/json': {} } } },
          },
        },
      },
    });
  });

  it('keeps operational routes out of the OpenAPI document', async () => {
    const response = await server.inject({ method: 'GET', url: '/openapi.json' });

    expect(Object.keys(response.json<{ paths: object }>().paths)).toEqual([
      '/v1/orders',
      '/v1/orders/{orderId}',
    ]);
  });
});
