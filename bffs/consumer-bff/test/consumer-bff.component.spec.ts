import { fastifyConnectPlugin } from '@connectrpc/connect-fastify';
import { createAccessTokenVerifier, readBearerToken } from '@fd/chassis-auth';
import { ConsumerService } from '@fd/contracts/fooddelivery/consumer/v1/service_pb.js';
import { OrderService } from '@fd/contracts/fooddelivery/order/v1/service_pb.js';
import { fastify, type FastifyInstance } from 'fastify';
import {
  recordSpans,
  startKeycloakContainer,
  traceparentOf,
  type StartedKeycloak,
} from '@fd/chassis-testing';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { startConsumerBff, type RunningConsumerBff } from '../src/main.ts';
import { FakeConsumerService, registeredConsumerId } from './support/consumer-service.fake.ts';
import { FakeOrderService, placedOrderId } from './support/order-service.fake.ts';

const orderServiceTimeoutInMilliseconds = 300;
const spans = recordSpans();

let orderService: FakeOrderService;
let consumerService: FakeConsumerService;
let servicesServer: FastifyInstance;
let keycloak: StartedKeycloak;
let consumerBff: RunningConsumerBff;
let consumerToken: string;

function bearer(accessToken: string): Record<string, string> {
  return { authorization: `Bearer ${accessToken}` };
}

function placeOrder(authorization = bearer(consumerToken)): Promise<Response> {
  return fetch(`${consumerBff.url}/v1/orders`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'idempotency-key': '0199a5d0-0000-4000-8000-0000000000f1',
      ...authorization,
    },
    body: JSON.stringify({
      restaurantId: '0199a5d0-0000-7000-8000-0000000000b1',
      lineItems: [{ menuItemId: '0199a5d0-0000-7000-8000-0000000000d1', quantity: 2 }],
      deliveryAddress: {
        street: 'Rua Augusta',
        number: '1500',
        city: 'Sao Paulo',
        postalCode: '01304-001',
      },
      paymentToken: 'tok_visa_4242',
    }),
  });
}

beforeAll(async () => {
  keycloak = await startKeycloakContainer();
  consumerToken = await keycloak.signIn('consumer-a');
  orderService = new FakeOrderService();
  consumerService = new FakeConsumerService();
  servicesServer = fastify();
  await servicesServer.register(fastifyConnectPlugin, {
    routes: (router) => {
      router.service(OrderService, orderService.implementation());
      router.service(ConsumerService, consumerService.implementation());
    },
  });
  const servicesUrl = await servicesServer.listen({ host: '127.0.0.1', port: 0 });
  consumerBff = await startConsumerBff({
    orderServiceUrl: servicesUrl,
    orderServiceTimeoutInMilliseconds,
    consumerServiceUrl: servicesUrl,
    consumerServiceTimeoutInMilliseconds: 5000,
    host: '127.0.0.1',
    port: 0,
    logLevel: 'silent',
    accessTokenIssuer: keycloak.issuer,
    accessTokenJwksUrl: keycloak.jwksUrl,
    tokenExchangeUrl: keycloak.tokenUrl,
    clientSecret: keycloak.consumerBffClientSecret,
  });
});

afterEach(() => {
  orderService.responseDelayInMilliseconds = 0;
});

afterAll(async () => {
  await consumerBff.stop();
  await servicesServer.close();
  await keycloak.stop();
});

describe('consumer bff', () => {
  it('places an order through the order service over HTTP', async () => {
    const response = await placeOrder();

    expect(response.status).toBe(201);
    expect(await response.json()).toEqual({ orderId: placedOrderId });
  });

  it('calls the order service with a token exchanged for its audience', async () => {
    await placeOrder();

    const forwarded = readBearerToken(orderService.receivedAuthorizations.at(-1));
    const verifier = createAccessTokenVerifier({
      issuer: keycloak.issuer,
      audience: 'order-service',
      jwksUrl: keycloak.jwksUrl,
    });
    const verified = await verifier(forwarded ?? '');
    expect(verified.isRight() && verified.success.subject).toBe(
      '0199a5d0-0000-7000-8000-0000000000c1',
    );
  });

  it.each([
    { scenario: 'without a token', username: undefined, status: 401 },
    { scenario: 'with the token of restaurant staff', username: 'staff-a', status: 403 },
  ])('answers a placement $scenario with a $status problem', async ({ username, status }) => {
    const authorization = username === undefined ? {} : bearer(await keycloak.signIn(username));
    const callsBefore = orderService.placeOrderRequests.length;

    const response = await placeOrder(authorization);

    expect(response.status).toBe(status);
    expect(response.headers.get('content-type')).toBe('application/problem+json; charset=utf-8');
    expect(orderService.placeOrderRequests).toHaveLength(callsBefore);
  });

  it('sends the span of each order service call as traceparent', async () => {
    await placeOrder();

    const call = spans.spansNamed('fooddelivery.order.v1.OrderService/PlaceOrder').at(-1);
    expect(orderService.receivedTraceparents.at(-1)).toBe(traceparentOf(call));
  });

  it('answers a gateway timeout problem when the order service misses its deadline', async () => {
    orderService.responseDelayInMilliseconds = orderServiceTimeoutInMilliseconds * 3;

    const response = await placeOrder();

    expect(response.status).toBe(504);
    expect(response.headers.get('content-type')).toBe('application/problem+json; charset=utf-8');
  });

  it('registers the caller through the consumer service with a token exchanged for its audience', async () => {
    const response = await fetch(`${consumerBff.url}/v1/consumers/me`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', ...bearer(consumerToken) },
      body: JSON.stringify({
        name: 'Ana Souza',
        email: 'ana.souza@food-delivery.test',
        addresses: [
          { street: 'Rua Augusta', number: '1500', city: 'Sao Paulo', postalCode: '01304-001' },
        ],
      }),
    });

    expect(response.status).toBe(201);
    expect(await response.json()).toEqual({ consumerId: registeredConsumerId });
    const forwarded = readBearerToken(consumerService.receivedAuthorizations.at(-1));
    const verifier = createAccessTokenVerifier({
      issuer: keycloak.issuer,
      audience: 'consumer-service',
      jwksUrl: keycloak.jwksUrl,
    });
    const verified = await verifier(forwarded ?? '');
    expect(verified.isRight() && verified.success.subject).toBe(
      '0199a5d0-0000-7000-8000-0000000000c1',
    );
  });

  it('answers its health endpoint', async () => {
    const response = await fetch(`${consumerBff.url}/health`);

    expect(response.status).toBe(200);
  });
});
