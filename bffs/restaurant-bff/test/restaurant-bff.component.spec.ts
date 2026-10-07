import { fastifyConnectPlugin } from '@connectrpc/connect-fastify';
import { createAccessTokenVerifier, readBearerToken } from '@fd/chassis-auth';
import {
  recordSpans,
  startKeycloakContainer,
  traceparentOf,
  type StartedKeycloak,
} from '@fd/chassis-testing';
import { KitchenService } from '@fd/contracts/fooddelivery/kitchen/v1/service_pb.js';
import { RestaurantService } from '@fd/contracts/fooddelivery/restaurant/v1/service_pb.js';
import { fastify, type FastifyInstance } from 'fastify';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { startRestaurantBff, type RunningRestaurantBff } from '../src/main.ts';
import { FakeKitchenService, kitchenRestaurantId } from './support/kitchen-service.fake.ts';
import { FakeRestaurantService, onboardedRestaurantId } from './support/restaurant-service.fake.ts';

const spans = recordSpans();

let restaurantService: FakeRestaurantService;
let kitchenService: FakeKitchenService;
let servicesServer: FastifyInstance;
let keycloak: StartedKeycloak;
let restaurantBff: RunningRestaurantBff;

function bearer(accessToken: string): Record<string, string> {
  return { authorization: `Bearer ${accessToken}` };
}

function onboard(authorization: Record<string, string>): Promise<Response> {
  return fetch(`${restaurantBff.url}/v1/restaurant/restaurants`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...authorization },
    body: JSON.stringify({
      name: 'Pizzaria Bella',
      category: 'Pizza',
      address: {
        street: 'Avenida Paulista',
        number: '1000',
        city: 'Sao Paulo',
        postalCode: '01310-100',
        location: { latitude: -23.5614, longitude: -46.6559 },
      },
      timeZone: 'America/Sao_Paulo',
      openingHours: [{ dayOfWeek: 'FRIDAY', opensAt: '18:00', closesAt: '23:30' }],
      minimumOrderInCents: '2000',
    }),
  });
}

beforeAll(async () => {
  keycloak = await startKeycloakContainer();
  restaurantService = new FakeRestaurantService();
  kitchenService = new FakeKitchenService();
  servicesServer = fastify();
  await servicesServer.register(fastifyConnectPlugin, {
    routes: (router) => {
      router.service(RestaurantService, restaurantService.implementation());
      router.service(KitchenService, kitchenService.implementation());
    },
  });
  const servicesUrl = await servicesServer.listen({ host: '127.0.0.1', port: 0 });
  restaurantBff = await startRestaurantBff({
    restaurantServiceUrl: servicesUrl,
    restaurantServiceTimeoutInMilliseconds: 5000,
    kitchenServiceUrl: servicesUrl,
    kitchenServiceTimeoutInMilliseconds: 5000,
    host: '127.0.0.1',
    port: 0,
    logLevel: 'silent',
    accessTokenIssuer: keycloak.issuer,
    accessTokenJwksUrl: keycloak.jwksUrl,
    tokenExchangeUrl: keycloak.tokenUrl,
    clientSecret: keycloak.restaurantBffClientSecret,
  });
});

afterAll(async () => {
  await restaurantBff.stop();
  await servicesServer.close();
  await keycloak.stop();
});

describe('restaurant bff', () => {
  it('onboards through the restaurant service with a token exchanged for its audience', async () => {
    const response = await onboard(bearer(await keycloak.signIn('staff-a')));

    expect(response.status).toBe(201);
    expect(await response.json()).toEqual({ restaurantId: onboardedRestaurantId });
    const forwarded = readBearerToken(restaurantService.receivedAuthorizations.at(-1));
    const verifier = createAccessTokenVerifier({
      issuer: keycloak.issuer,
      audience: 'restaurant-service',
      jwksUrl: keycloak.jwksUrl,
    });
    const verified = await verifier(forwarded ?? '');
    expect(verified.isRight() && verified.success.subject).toBe(
      '0199a5d0-0000-7000-8000-0000000000e1',
    );
  });

  it.each([
    { scenario: 'without a token', username: undefined, status: 401 },
    { scenario: 'with the token of a consumer', username: 'consumer-a', status: 403 },
  ])('answers an onboarding $scenario with a $status problem', async ({ username, status }) => {
    const authorization = username === undefined ? {} : bearer(await keycloak.signIn(username));
    const callsBefore = restaurantService.onboardRestaurantRequests.length;

    const response = await onboard(authorization);

    expect(response.status).toBe(status);
    expect(response.headers.get('content-type')).toBe('application/problem+json; charset=utf-8');
    expect(restaurantService.onboardRestaurantRequests).toHaveLength(callsBefore);
  });

  it('lists tickets through the kitchen service with a token exchanged for its audience', async () => {
    const response = await fetch(
      `${restaurantBff.url}/v1/restaurant/restaurants/${kitchenRestaurantId}/tickets`,
      { headers: bearer(await keycloak.signIn('staff-a')) },
    );

    expect(response.status).toBe(200);
    const forwarded = readBearerToken(kitchenService.receivedAuthorizations.at(-1));
    const verifier = createAccessTokenVerifier({
      issuer: keycloak.issuer,
      audience: 'kitchen-service',
      jwksUrl: keycloak.jwksUrl,
    });
    const verified = await verifier(forwarded ?? '');
    expect(verified.isRight() && verified.success.subject).toBe(
      '0199a5d0-0000-7000-8000-0000000000e1',
    );
  });

  it('sends the span of each restaurant service call as traceparent', async () => {
    await onboard(bearer(await keycloak.signIn('staff-a')));

    const call = spans
      .spansNamed('fooddelivery.restaurant.v1.RestaurantService/OnboardRestaurant')
      .at(-1);
    expect(restaurantService.receivedTraceparents.at(-1)).toBe(traceparentOf(call));
  });

  it('answers its health endpoint', async () => {
    const response = await fetch(`${restaurantBff.url}/health`);

    expect(response.status).toBe(200);
  });
});
