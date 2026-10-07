import { Code, ConnectError, type ServiceImpl } from '@connectrpc/connect';
import {
  SearchRestaurantsFailureSchema,
  type RestaurantCatalogueService,
} from '@fd/contracts/fooddelivery/restaurant/v1/catalogue_pb.js';
import { SearchIndexUnavailableError } from '#application/ports/restaurant-search-index.port.ts';
import type { GetPublicRestaurantQueryHandler } from '#application/queries/get-public-restaurant/get-public-restaurant.query-handler.ts';
import type { SearchRestaurantsQueryHandler } from '#application/queries/search-restaurants/search-restaurants.query-handler.ts';
import type { SearchRestaurantsQuery } from '#application/queries/search-restaurants/search-restaurants.query.ts';
import { parseRestaurantId } from '#domain/restaurant/restaurant-id.value-object.ts';
import { toSearchRestaurantsQuery } from './restaurant-request.message-mapper.ts';
import {
  toGetPublicRestaurantResponse,
  toSearchRestaurantsResponse,
} from './restaurant-response.message-mapper.ts';

export interface RestaurantCatalogueRpcServiceSettings {
  readonly searchRestaurants: SearchRestaurantsQueryHandler;
  readonly getPublicRestaurant: GetPublicRestaurantQueryHandler;
}

function searchRestaurants(
  handler: SearchRestaurantsQueryHandler,
  query: SearchRestaurantsQuery,
): ReturnType<SearchRestaurantsQueryHandler['execute']> {
  return handler.execute(query).catch((error: unknown) => {
    if (!(error instanceof SearchIndexUnavailableError)) throw error;
    throw new ConnectError('search index unavailable', Code.Unavailable);
  });
}

export function createRestaurantCatalogueRpcService(
  settings: RestaurantCatalogueRpcServiceSettings,
): ServiceImpl<typeof RestaurantCatalogueService> {
  return {
    async searchRestaurants(request) {
      const query = toSearchRestaurantsQuery(request);
      const outcome = await searchRestaurants(settings.searchRestaurants, query);
      if (outcome.isLeft()) {
        const reason = outcome.failure.type;
        throw new ConnectError(reason, Code.InvalidArgument, undefined, [
          { desc: SearchRestaurantsFailureSchema, value: { reason } },
        ]);
      }
      return toSearchRestaurantsResponse(outcome.success);
    },

    async getPublicRestaurant(request) {
      const restaurantId = parseRestaurantId(request.restaurantId);
      if (restaurantId.isLeft()) throw new ConnectError('restaurant_id', Code.InvalidArgument);
      const outcome = await settings.getPublicRestaurant.execute({
        restaurantId: restaurantId.success,
      });
      if (outcome.isLeft()) throw new ConnectError(outcome.failure.type, Code.NotFound);
      return toGetPublicRestaurantResponse(outcome.success);
    },
  };
}
