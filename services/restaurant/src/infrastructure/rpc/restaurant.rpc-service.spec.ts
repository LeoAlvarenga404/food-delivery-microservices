import { create, type MessageInitShape } from '@bufbuild/protobuf';
import {
  Code,
  ConnectError,
  createClient,
  createRouterTransport,
  type Client,
  type Interceptor,
} from '@connectrpc/connect';
import { createAccessTokenInterceptor, type AccessTokenVerifier } from '@fd/chassis-auth';
import { createLogger } from '@fd/chassis-observability';
import { ConcurrencyConflictError } from '@fd/chassis-postgres';
import { createRpcCorrelation } from '@fd/chassis-rpc';
import { DayOfWeek } from '@fd/contracts/fooddelivery/restaurant/v1/events_pb.js';
import {
  MembershipRole,
  OnboardRestaurantFailureSchema,
  OnboardRestaurantRequestSchema,
  ReviseMenuFailureSchema,
  RestaurantService,
  type OnboardRestaurantRequest,
} from '@fd/contracts/fooddelivery/restaurant/v1/service_pb.js';
import { left, right } from '@fd/domain';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { FakeClock } from '../../../test/support/clock.fake.ts';
import { FakeIdGenerator } from '../../../test/support/id-generator.fake.ts';
import { InMemoryUnitOfWork } from '../../../test/support/in-memory-unit-of-work.adapter.ts';
import {
  buildRestaurant,
  guarana,
  margherita,
  pizzeriaId,
  pizzeriaProfile,
  staffAId,
  staffBId,
} from '../../../test/support/restaurant.builder.ts';
import { OnboardRestaurantCommandHandler } from '#application/commands/onboard-restaurant/onboard-restaurant.command-handler.ts';
import { ReviseMenuCommandHandler } from '#application/commands/revise-menu/revise-menu.command-handler.ts';
import { GetRestaurantQueryHandler } from '#application/queries/get-restaurant/get-restaurant.query-handler.ts';
import { ListMembershipsQueryHandler } from '#application/queries/list-memberships/list-memberships.query-handler.ts';
import { createRestaurantRpcService } from './restaurant.rpc-service.ts';

const callerCorrelationId = '0199a5d0-0000-7000-8000-0000000000f2';
const unknownRestaurantId = '0199a5d0-0000-7000-8000-0000000000bf';
const verifiedAccessTokens = new Map([
  ['staff-a-token', { subject: staffAId, roles: ['restaurant_staff'] }],
  ['staff-b-token', { subject: staffBId, roles: ['restaurant_staff'] }],
  ['consumer-token', { subject: '0199a5d0-0000-7000-8000-0000000000c1', roles: ['consumer'] }],
]);

type OnboardRestaurantRequestInit = Exclude<
  MessageInitShape<typeof OnboardRestaurantRequestSchema>,
  OnboardRestaurantRequest
>;

let unitOfWork: InMemoryUnitOfWork;

const verify: AccessTokenVerifier = (accessToken) => {
  const verified = verifiedAccessTokens.get(accessToken);
  return Promise.resolve(
    verified === undefined
      ? left({ type: 'InvalidAccessToken', reason: 'ERR_JWS_INVALID' })
      : right(verified),
  );
};

function sendingAccessToken(accessToken: string): Interceptor {
  return (next) => (request) => {
    request.header.set('authorization', `Bearer ${accessToken}`);
    return next(request);
  };
}

function clientFor(accessToken: string): Client<typeof RestaurantService> {
  const correlation = createRpcCorrelation({
    logger: createLogger({ serviceName: 'restaurant-service', level: 'silent' }),
    generateCorrelationId: () => '0199a5d0-0000-7000-8000-0000000000f9',
  });
  const clock = new FakeClock();
  const transport = createRouterTransport(
    ({ service }) => {
      service(
        RestaurantService,
        createRestaurantRpcService({
          onboardRestaurant: new OnboardRestaurantCommandHandler({
            unitOfWork,
            clock,
            idGenerator: new FakeIdGenerator(),
          }),
          reviseMenu: new ReviseMenuCommandHandler({ unitOfWork, clock }),
          getRestaurant: new GetRestaurantQueryHandler(unitOfWork.restaurants),
          listMemberships: new ListMembershipsQueryHandler(unitOfWork.restaurants),
        }),
      );
    },
    {
      router: { interceptors: [correlation, createAccessTokenInterceptor(verify)] },
      transport: { interceptors: [sendingAccessToken(accessToken)] },
    },
  );
  return createClient(RestaurantService, transport);
}

function onboardRestaurantRequest(
  overrides: OnboardRestaurantRequestInit = {},
): OnboardRestaurantRequest {
  return create(OnboardRestaurantRequestSchema, {
    name: pizzeriaProfile.name,
    category: pizzeriaProfile.category,
    address: pizzeriaProfile.address,
    timeZone: pizzeriaProfile.timeZone,
    openingHours: [{ dayOfWeek: DayOfWeek.FRIDAY, opensAt: '18:00', closesAt: '23:30' }],
    minimumOrderInCents: pizzeriaProfile.minimumOrderInCents,
    ...overrides,
  });
}

async function rejectionOf(call: Promise<unknown>): Promise<ConnectError> {
  return ConnectError.from(
    await call.then(
      () => undefined,
      (rejection: unknown) => rejection,
    ),
  );
}

beforeEach(() => {
  unitOfWork = new InMemoryUnitOfWork([buildRestaurant({ version: 1 })]);
});

describe('RestaurantService.OnboardRestaurant', () => {
  beforeEach(() => {
    unitOfWork = new InMemoryUnitOfWork();
  });

  it('onboards a restaurant owned by the staff member of the token, who becomes the actor', async () => {
    const response = await clientFor('staff-b-token').onboardRestaurant(
      onboardRestaurantRequest(),
      { headers: { 'x-correlation-id': callerCorrelationId } },
    );

    expect(response.restaurantId).toBe(pizzeriaId);
    expect((await unitOfWork.restaurants.findById(pizzeriaId))?.toSnapshot()).toMatchObject({
      name: 'Pizzaria Bella',
      openingHours: [{ dayOfWeek: 'FRIDAY', opensAt: '18:00', closesAt: '23:30' }],
      members: [{ staffMemberId: staffBId, role: 'OWNER' }],
      version: 1,
    });
    expect(unitOfWork.executedMetadata).toEqual([
      {
        correlationId: callerCorrelationId,
        causationId: undefined,
        actorId: staffBId,
        actorType: 'restaurant_staff',
      },
    ]);
  });

  it.each([
    {
      invalidPart: 'an unknown time zone',
      request: { timeZone: 'Paulista' },
      reason: 'InvalidTimeZone',
    },
    {
      invalidPart: 'no address',
      request: { address: undefined },
      reason: 'InvalidRestaurantAddress',
    },
    {
      invalidPart: 'an address without location',
      request: { address: { ...pizzeriaProfile.address, location: undefined } },
      reason: 'InvalidRestaurantAddress',
    },
    {
      invalidPart: 'a period without day',
      request: {
        openingHours: [{ dayOfWeek: DayOfWeek.UNSPECIFIED, opensAt: '18:00', closesAt: '23:00' }],
      },
      reason: 'InvalidOpeningPeriod',
    },
    {
      invalidPart: 'a negative minimum order',
      request: { minimumOrderInCents: -1n },
      reason: 'InvalidMinimumOrder',
    },
  ])(
    'refuses $invalidPart as an invalid argument naming the reason',
    async ({ request, reason }) => {
      const error = await rejectionOf(
        clientFor('staff-a-token').onboardRestaurant(onboardRestaurantRequest(request)),
      );

      expect(error.code).toBe(Code.InvalidArgument);
      expect(error.findDetails(OnboardRestaurantFailureSchema).at(0)?.reason).toBe(reason);
      expect(await unitOfWork.restaurants.findById(pizzeriaId)).toBeUndefined();
    },
  );

  it('refuses a caller without the restaurant staff role as permission denied before any work', async () => {
    const error = await rejectionOf(
      clientFor('consumer-token').onboardRestaurant(onboardRestaurantRequest()),
    );

    expect(error.code).toBe(Code.PermissionDenied);
    expect(unitOfWork.executedMetadata).toEqual([]);
  });
});

describe('RestaurantService.ReviseMenu', () => {
  it('replaces the menu for a member and answers the new version', async () => {
    const response = await clientFor('staff-a-token').reviseMenu({
      restaurantId: pizzeriaId.toUpperCase(),
      menuItems: [guarana, margherita],
    });

    expect(response.version).toBe(2);
    expect(unitOfWork.publishedEvents).toMatchObject([
      { restaurantId: pizzeriaId, version: 2, menuItems: [guarana, margherita] },
    ]);
  });

  it.each([
    {
      scenario: 'another staff member',
      accessToken: 'staff-b-token',
      restaurantId: pizzeriaId,
      code: Code.PermissionDenied,
      reason: 'NotRestaurantMember',
    },
    {
      scenario: 'a restaurant that was never onboarded',
      accessToken: 'staff-a-token',
      restaurantId: unknownRestaurantId,
      code: Code.NotFound,
      reason: 'RestaurantNotFound',
    },
  ])(
    'refuses $scenario, naming the reason',
    async ({ accessToken, restaurantId, code, reason }) => {
      const error = await rejectionOf(
        clientFor(accessToken).reviseMenu({ restaurantId, menuItems: [guarana] }),
      );

      expect(error.code).toBe(code);
      expect(error.findDetails(ReviseMenuFailureSchema).at(0)?.reason).toBe(reason);
      expect(unitOfWork.publishedEvents).toEqual([]);
    },
  );

  it('refuses a menu that lists an item twice as an invalid argument naming the reason', async () => {
    const error = await rejectionOf(
      clientFor('staff-a-token').reviseMenu({
        restaurantId: pizzeriaId,
        menuItems: [guarana, guarana],
      }),
    );

    expect(error.code).toBe(Code.InvalidArgument);
    expect(error.findDetails(ReviseMenuFailureSchema).at(0)?.reason).toBe('DuplicateMenuItem');
  });

  it('refuses a restaurant id that is not a uuid as an invalid argument', async () => {
    const error = await rejectionOf(
      clientFor('staff-a-token').reviseMenu({ restaurantId: 'pizzeria', menuItems: [] }),
    );

    expect(error.code).toBe(Code.InvalidArgument);
  });

  it('answers a revision that loses a race with a concurrent one as aborted', async () => {
    vi.spyOn(unitOfWork.restaurants, 'save').mockRejectedValue(
      new ConcurrencyConflictError(`restaurant ${pizzeriaId} changed after version 1`),
    );

    const error = await rejectionOf(
      clientFor('staff-a-token').reviseMenu({ restaurantId: pizzeriaId, menuItems: [guarana] }),
    );

    expect(error.code).toBe(Code.Aborted);
    expect(error.findDetails(ReviseMenuFailureSchema).at(0)?.reason).toBe('ConcurrentMenuRevision');
  });
});

describe('RestaurantService.GetRestaurant', () => {
  it('answers the restaurant with its version to one of its members', async () => {
    const response = await clientFor('staff-a-token').getRestaurant({ restaurantId: pizzeriaId });

    expect(response.restaurant).toMatchObject({
      restaurantId: pizzeriaId,
      version: 1,
      name: 'Pizzaria Bella',
      menuItems: [margherita, guarana],
    });
  });

  it.each([
    {
      scenario: 'another staff member',
      accessToken: 'staff-b-token',
      restaurantId: pizzeriaId,
      code: Code.PermissionDenied,
    },
    {
      scenario: 'an unknown restaurant',
      accessToken: 'staff-a-token',
      restaurantId: unknownRestaurantId,
      code: Code.NotFound,
    },
    {
      scenario: 'an id that is not a uuid',
      accessToken: 'staff-a-token',
      restaurantId: 'pizzeria',
      code: Code.InvalidArgument,
    },
  ])('refuses $scenario', async ({ accessToken, restaurantId, code }) => {
    const error = await rejectionOf(clientFor(accessToken).getRestaurant({ restaurantId }));

    expect(error.code).toBe(code);
  });
});

describe('RestaurantService.ListMemberships', () => {
  it('lists the restaurants of the caller with its role', async () => {
    const response = await clientFor('staff-a-token').listMemberships({});

    expect(response.memberships).toMatchObject([
      { restaurantId: pizzeriaId, restaurantName: 'Pizzaria Bella', role: MembershipRole.OWNER },
    ]);
  });

  it('lists nothing for a staff member of no restaurant', async () => {
    expect((await clientFor('staff-b-token').listMemberships({})).memberships).toEqual([]);
  });
});

describe('RestaurantService for a caller without the restaurant staff role', () => {
  it.each([
    {
      procedure: 'ReviseMenu',
      call: (client: Client<typeof RestaurantService>) =>
        client.reviseMenu({ restaurantId: pizzeriaId, menuItems: [guarana] }),
    },
    {
      procedure: 'GetRestaurant',
      call: (client: Client<typeof RestaurantService>) =>
        client.getRestaurant({ restaurantId: pizzeriaId }),
    },
    {
      procedure: 'ListMemberships',
      call: (client: Client<typeof RestaurantService>) => client.listMemberships({}),
    },
  ])('refuses $procedure as permission denied for the missing role', async ({ call }) => {
    const error = await rejectionOf(call(clientFor('consumer-token')));

    expect(error.code).toBe(Code.PermissionDenied);
    expect(error.rawMessage).toBe('MissingRestaurantStaffRole');
    expect(unitOfWork.publishedEvents).toEqual([]);
  });
});
