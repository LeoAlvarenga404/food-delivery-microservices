import type { Client } from '@connectrpc/connect';
import { DayOfWeek } from '@fd/contracts/fooddelivery/restaurant/v1/events_pb.js';
import type { RestaurantService } from '@fd/contracts/fooddelivery/restaurant/v1/service_pb.js';
import type { FastifyPluginCallbackZod } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { problemDetailsSchema } from '../http/problem-details.adapter.ts';
import {
  requireServiceAccess,
  serviceCallOptions,
  type RoutesServer,
  type ServiceAccess,
} from '../http/service-access.adapter.ts';
import {
  membershipsViewSchema,
  menuItemSchema,
  onboardingSchema,
  restaurantViewSchema,
  toMembershipsView,
  toRestaurantView,
} from './restaurant-view.message-mapper.ts';

export interface RestaurantRoutesSettings {
  readonly restaurantService: Client<typeof RestaurantService>;
  readonly serviceAccess: ServiceAccess;
}

const problemResponse = {
  content: { 'application/problem+json': { schema: problemDetailsSchema } },
};
const problemResponses = { '4xx': problemResponse, '5xx': problemResponse };
const restaurantServiceAudience = 'restaurant-service';
const restaurantsPath = '/v1/restaurant/restaurants';
const restaurantParams = z.object({ restaurantId: z.uuid() });

const onboardRestaurantSchema = {
  body: onboardingSchema,
  response: { 201: z.object({ restaurantId: z.uuid() }), ...problemResponses },
};

const reviseMenuSchema = {
  params: restaurantParams,
  body: z.object({ menuItems: z.array(menuItemSchema) }),
  response: { 200: z.object({ version: z.int() }), ...problemResponses },
};

const getRestaurantSchema = {
  params: restaurantParams,
  response: { 200: restaurantViewSchema, ...problemResponses },
};

const listMembershipsSchema = {
  response: { 200: membershipsViewSchema, ...problemResponses },
};

function registerOnboardRestaurant(server: RoutesServer, settings: RestaurantRoutesSettings): void {
  server.post(restaurantsPath, { schema: onboardRestaurantSchema }, async (request, reply) => {
    const { body } = request;
    const onboarded = await settings.restaurantService.onboardRestaurant(
      {
        ...body,
        openingHours: body.openingHours.map(({ dayOfWeek, opensAt, closesAt }) => ({
          dayOfWeek: DayOfWeek[dayOfWeek],
          opensAt,
          closesAt,
        })),
        minimumOrderInCents: BigInt(body.minimumOrderInCents),
      },
      serviceCallOptions(request),
    );
    const { restaurantId } = onboarded;
    return reply
      .code(201)
      .header('location', `${restaurantsPath}/${restaurantId}`)
      .send({ restaurantId });
  });
}

function registerReviseMenu(server: RoutesServer, settings: RestaurantRoutesSettings): void {
  const path = `${restaurantsPath}/:restaurantId/menu`;
  server.put(path, { schema: reviseMenuSchema }, async (request) => {
    const revised = await settings.restaurantService.reviseMenu(
      {
        restaurantId: request.params.restaurantId,
        menuItems: request.body.menuItems.map((menuItem) => ({
          ...menuItem,
          priceInCents: BigInt(menuItem.priceInCents),
        })),
      },
      serviceCallOptions(request),
    );
    return { version: revised.version };
  });
}

function registerGetRestaurant(server: RoutesServer, settings: RestaurantRoutesSettings): void {
  const path = `${restaurantsPath}/:restaurantId`;
  server.get(path, { schema: getRestaurantSchema }, async (request) => {
    const restaurant = await settings.restaurantService.getRestaurant(
      { restaurantId: request.params.restaurantId },
      serviceCallOptions(request),
    );
    return toRestaurantView(restaurant);
  });
}

function registerListMemberships(server: RoutesServer, settings: RestaurantRoutesSettings): void {
  server.get('/v1/restaurant/memberships', { schema: listMembershipsSchema }, async (request) => {
    const memberships = await settings.restaurantService.listMemberships(
      {},
      serviceCallOptions(request),
    );
    return toMembershipsView(memberships);
  });
}

export const restaurantRoutes: FastifyPluginCallbackZod<RestaurantRoutesSettings> = (
  server,
  settings,
  done,
) => {
  requireServiceAccess(server, settings.serviceAccess, restaurantServiceAudience);
  registerOnboardRestaurant(server, settings);
  registerReviseMenu(server, settings);
  registerGetRestaurant(server, settings);
  registerListMemberships(server, settings);
  done();
};
