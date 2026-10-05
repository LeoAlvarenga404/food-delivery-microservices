import type { CallOptions, Client } from '@connectrpc/connect';
import type { RestaurantCatalogueService } from '@fd/contracts/fooddelivery/restaurant/v1/catalogue_pb.js';
import type { FastifyRequest } from 'fastify';
import type { FastifyPluginCallbackZod } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { problemDetailsSchema } from '../http/problem-details.adapter.ts';
import type { RoutesServer } from '../http/service-access.adapter.ts';
import {
  publicRestaurantViewSchema,
  restaurantSearchViewSchema,
  toPublicRestaurantView,
  toRestaurantSearchView,
} from './restaurant-view.message-mapper.ts';

export interface RestaurantRoutesSettings {
  readonly restaurantCatalogueService: Client<typeof RestaurantCatalogueService>;
}

const problemResponse = {
  content: { 'application/problem+json': { schema: problemDetailsSchema } },
};
const problemResponses = { '4xx': problemResponse, '5xx': problemResponse };

const searchRestaurantsSchema = {
  querystring: z
    .object({
      text: z.string().max(100).default(''),
      category: z.string().max(50).optional(),
      latitude: z.coerce.number().optional(),
      longitude: z.coerce.number().optional(),
      radiusInKilometers: z.coerce.number().optional(),
      limit: z.coerce.number().int().min(1).max(50).default(20),
    })
    .refine((query) => (query.latitude === undefined) === (query.longitude === undefined), {
      message: 'latitude and longitude go together',
    }),
  response: { 200: restaurantSearchViewSchema, ...problemResponses },
};

const getPublicRestaurantSchema = {
  params: z.object({ restaurantId: z.uuid() }),
  response: { 200: publicRestaurantViewSchema, 304: z.undefined(), ...problemResponses },
};

function catalogueCallOptions(request: FastifyRequest): CallOptions {
  return { headers: { 'x-correlation-id': request.id } };
}

function isNotModified(ifNoneMatch: string | undefined, entityTag: string): boolean {
  if (ifNoneMatch === undefined) return false;
  return ifNoneMatch
    .split(',')
    .map((candidate) => candidate.trim().replace(/^W\//, ''))
    .some((candidate) => candidate === '*' || candidate === entityTag);
}

function registerSearchRestaurants(server: RoutesServer, settings: RestaurantRoutesSettings): void {
  server.get('/v1/restaurants', { schema: searchRestaurantsSchema }, async (request) => {
    const { text, category, latitude, longitude, radiusInKilometers, limit } = request.query;
    const response = await settings.restaurantCatalogueService.searchRestaurants(
      {
        text,
        category: category ?? '',
        ...(latitude !== undefined &&
          longitude !== undefined && { origin: { latitude, longitude } }),
        radiusInKilometers: radiusInKilometers ?? 0,
        limit,
      },
      catalogueCallOptions(request),
    );
    return toRestaurantSearchView(response);
  });
}

function registerGetPublicRestaurant(
  server: RoutesServer,
  settings: RestaurantRoutesSettings,
): void {
  server.get(
    '/v1/restaurants/:restaurantId',
    { schema: getPublicRestaurantSchema },
    async (request, reply) => {
      const { restaurant } = await settings.restaurantCatalogueService.getPublicRestaurant(
        { restaurantId: request.params.restaurantId },
        catalogueCallOptions(request),
      );
      if (restaurant === undefined)
        throw new Error('the restaurant service answered no restaurant');
      const entityTag = `"${String(restaurant.version)}"`;
      void reply.header('etag', entityTag);
      if (isNotModified(request.headers['if-none-match'], entityTag)) return reply.code(304).send();
      return toPublicRestaurantView(restaurant);
    },
  );
}

export const restaurantRoutes: FastifyPluginCallbackZod<RestaurantRoutesSettings> = (
  server,
  settings,
  done,
) => {
  registerSearchRestaurants(server, settings);
  registerGetPublicRestaurant(server, settings);
  done();
};
