import { create } from '@bufbuild/protobuf';
import { Code, ConnectError } from '@connectrpc/connect';
import { createLogger } from '@fd/chassis-observability';
import { DayOfWeek } from '@fd/contracts/fooddelivery/restaurant/v1/events_pb.js';
import {
  GetRestaurantResponseSchema,
  ListMembershipsResponseSchema,
  MembershipRole,
  OnboardRestaurantFailureSchema,
  ReviseMenuFailureSchema,
} from '@fd/contracts/fooddelivery/restaurant/v1/service_pb.js';
import type { LightMyRequestResponse } from 'fastify';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  FakeRestaurantService,
  onboardedRestaurantId,
} from '../../test/support/restaurant-service.fake.ts';
import { fakeServiceAccess } from '../../test/support/service-access.fake.ts';
import { createRestaurantBffServer, type RestaurantBffServer } from '../main.ts';

const callerCorrelationId = '0199a5d0-0000-7000-8000-0000000000f2';
const staffAuthorization = { authorization: 'Bearer staff-token' };
const restaurantPath = `/v1/restaurant/restaurants/${onboardedRestaurantId}`;
const paulista = {
  street: 'Avenida Paulista',
  number: '1000',
  city: 'Sao Paulo',
  postalCode: '01310-100',
  location: { latitude: -23.5614, longitude: -46.6559 },
};
const onboarding = {
  name: 'Pizzaria Bella',
  category: 'Pizza',
  address: paulista,
  timeZone: 'America/Sao_Paulo',
  openingHours: [{ dayOfWeek: 'FRIDAY', opensAt: '18:00', closesAt: '23:30' }],
  minimumOrderInCents: '2000',
};
const margherita = {
  menuItemId: '0199a5d0-0000-7000-8000-000000000d01',
  name: 'Margherita',
  priceInCents: '4500',
  isAvailable: true,
};

let restaurantService: FakeRestaurantService;
let server: RestaurantBffServer;

function onboard(
  headers: Record<string, string>,
  body: Record<string, unknown> = onboarding,
): Promise<LightMyRequestResponse> {
  return server.inject({
    method: 'POST',
    url: '/v1/restaurant/restaurants',
    headers,
    payload: body,
  });
}

function reviseMenu(
  headers: Record<string, string>,
  path = `${restaurantPath}/menu`,
): Promise<LightMyRequestResponse> {
  return server.inject({ method: 'PUT', url: path, headers, payload: { menuItems: [margherita] } });
}

function refusal(code: Code, reason: string): ConnectError {
  return new ConnectError('refused', code, undefined, [
    { desc: ReviseMenuFailureSchema, value: { reason } },
  ]);
}

beforeEach(async () => {
  restaurantService = new FakeRestaurantService();
  server = await createRestaurantBffServer({
    restaurantService: restaurantService.client(),
    serviceAccess: fakeServiceAccess,
    logger: createLogger({ serviceName: 'restaurant-bff', level: 'silent' }),
    generateCorrelationId: () => '0199a5d0-0000-7000-8000-0000000000f9',
  });
});

afterEach(() => server.close());

describe('POST /v1/restaurant/restaurants', () => {
  it('onboards a restaurant with the restaurant service token and answers with its location', async () => {
    const response = await onboard({
      ...staffAuthorization,
      'x-correlation-id': callerCorrelationId,
    });

    expect(response.statusCode).toBe(201);
    expect(response.headers.location).toBe(restaurantPath);
    expect(response.json()).toEqual({ restaurantId: onboardedRestaurantId });
    expect(restaurantService.receivedAuthorizations).toEqual(['Bearer restaurant-service-token']);
    expect(restaurantService.receivedCorrelationIds).toEqual([callerCorrelationId]);
    expect(restaurantService.onboardRestaurantRequests).toMatchObject([
      {
        name: 'Pizzaria Bella',
        address: paulista,
        openingHours: [{ dayOfWeek: DayOfWeek.FRIDAY, opensAt: '18:00', closesAt: '23:30' }],
        minimumOrderInCents: 2000n,
      },
    ]);
  });

  it.each([
    { scenario: 'without a token', headers: {}, status: 401 },
    {
      scenario: 'with the token of a caller who is not restaurant staff',
      headers: { authorization: 'Bearer consumer-token' },
      status: 403,
    },
  ])(
    'answers an onboarding $scenario with a $status problem before validating it',
    async ({ headers, status }) => {
      const response = await onboard(headers, { name: 7 });

      expect(response.statusCode).toBe(status);
      expect(response.headers['content-type']).toBe('application/problem+json; charset=utf-8');
      expect(restaurantService.receivedCorrelationIds).toHaveLength(0);
    },
  );

  it.each([
    {
      invalidPart: 'an address without location',
      body: { ...onboarding, address: { ...paulista, location: undefined } },
    },
    {
      invalidPart: 'an unknown day',
      body: {
        ...onboarding,
        openingHours: [{ dayOfWeek: 'friday', opensAt: '18:00', closesAt: '23:00' }],
      },
    },
    {
      invalidPart: 'a minimum order that is not a whole number',
      body: { ...onboarding, minimumOrderInCents: '20.5' },
    },
  ])(
    'answers $invalidPart with a bad request problem without calling the restaurant service',
    async ({ body }) => {
      const response = await onboard(staffAuthorization, body);

      expect(response.statusCode).toBe(400);
      expect(response.json()).toMatchObject({ title: 'Bad Request', status: 400 });
      expect(restaurantService.receivedCorrelationIds).toHaveLength(0);
    },
  );

  it('answers a refused profile with a bad request problem naming the reason', async () => {
    restaurantService.failure = new ConnectError('refused', Code.InvalidArgument, undefined, [
      { desc: OnboardRestaurantFailureSchema, value: { reason: 'InvalidTimeZone' } },
    ]);

    const response = await onboard(staffAuthorization);

    expect(response.statusCode).toBe(400);
    expect(response.json()).toEqual({
      type: 'about:blank',
      title: 'Bad Request',
      status: 400,
      reason: 'InvalidTimeZone',
    });
  });
});

describe('PUT /v1/restaurant/restaurants/:restaurantId/menu', () => {
  it('revises the menu with the restaurant service token and answers the new version', async () => {
    const response = await reviseMenu(staffAuthorization);

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ version: 2 });
    expect(restaurantService.reviseMenuRequests).toMatchObject([
      {
        restaurantId: onboardedRestaurantId,
        menuItems: [{ ...margherita, priceInCents: 4500n }],
      },
    ]);
    expect(restaurantService.receivedAuthorizations).toEqual(['Bearer restaurant-service-token']);
  });

  it.each([
    { code: Code.PermissionDenied, reason: 'NotRestaurantMember', status: 403, title: 'Forbidden' },
    { code: Code.NotFound, reason: 'RestaurantNotFound', status: 404, title: 'Not Found' },
    { code: Code.Aborted, reason: 'ConcurrentMenuRevision', status: 409, title: 'Conflict' },
    { code: Code.InvalidArgument, reason: 'DuplicateMenuItem', status: 400, title: 'Bad Request' },
  ])(
    'answers a $reason refusal with a $status problem naming the reason',
    async ({ code, reason, status, title }) => {
      restaurantService.failure = refusal(code, reason);

      const response = await reviseMenu(staffAuthorization);

      expect(response.statusCode).toBe(status);
      expect(response.json()).toEqual({ type: 'about:blank', title, status, reason });
    },
  );

  it('answers a restaurant id that is not a uuid with a bad request problem', async () => {
    const response = await reviseMenu(
      staffAuthorization,
      '/v1/restaurant/restaurants/pizzeria/menu',
    );

    expect(response.statusCode).toBe(400);
    expect(restaurantService.receivedCorrelationIds).toHaveLength(0);
  });
});

describe('GET /v1/restaurant/restaurants/:restaurantId', () => {
  it('answers the restaurant with amounts as decimal strings and days by name', async () => {
    restaurantService.restaurant = create(GetRestaurantResponseSchema, {
      restaurant: {
        restaurantId: onboardedRestaurantId,
        version: 3,
        name: 'Pizzaria Bella',
        category: 'Pizza',
        address: paulista,
        timeZone: 'America/Sao_Paulo',
        openingHours: [{ dayOfWeek: DayOfWeek.SATURDAY, opensAt: '18:00', closesAt: '02:00' }],
        minimumOrderInCents: 2000n,
        currency: 'BRL',
        menuItems: [{ ...margherita, priceInCents: 4500n }],
      },
    });

    const response = await server.inject({
      method: 'GET',
      url: restaurantPath,
      headers: staffAuthorization,
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({
      restaurantId: onboardedRestaurantId,
      version: 3,
      name: 'Pizzaria Bella',
      category: 'Pizza',
      address: paulista,
      timeZone: 'America/Sao_Paulo',
      openingHours: [{ dayOfWeek: 'SATURDAY', opensAt: '18:00', closesAt: '02:00' }],
      minimumOrderInCents: '2000',
      currency: 'BRL',
      menuItems: [margherita],
    });
  });

  it('answers another staff member with a forbidden problem', async () => {
    restaurantService.failure = new ConnectError('NotRestaurantMember', Code.PermissionDenied);

    const response = await server.inject({
      method: 'GET',
      url: restaurantPath,
      headers: staffAuthorization,
    });

    expect(response.statusCode).toBe(403);
    expect(response.json()).toEqual({ type: 'about:blank', title: 'Forbidden', status: 403 });
  });

  it('answers a restaurant the service sent without a location with an internal problem', async () => {
    restaurantService.restaurant = create(GetRestaurantResponseSchema, {
      restaurant: { restaurantId: onboardedRestaurantId, address: { street: 'Rua' } },
    });

    const response = await server.inject({
      method: 'GET',
      url: restaurantPath,
      headers: staffAuthorization,
    });

    expect(response.statusCode).toBe(500);
  });
});

describe('GET /v1/restaurant/memberships', () => {
  it('lists the restaurants of the caller with its role', async () => {
    restaurantService.memberships = create(ListMembershipsResponseSchema, {
      memberships: [
        {
          restaurantId: onboardedRestaurantId,
          restaurantName: 'Pizzaria Bella',
          role: MembershipRole.OWNER,
        },
      ],
    });

    const response = await server.inject({
      method: 'GET',
      url: '/v1/restaurant/memberships',
      headers: staffAuthorization,
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({
      memberships: [
        { restaurantId: onboardedRestaurantId, restaurantName: 'Pizzaria Bella', role: 'OWNER' },
      ],
    });
  });
});
