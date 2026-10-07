import { create, type MessageInitShape } from '@bufbuild/protobuf';
import {
  Code,
  ConnectError,
  createClient,
  createRouterTransport,
  type Client,
  type HandlerContext,
  type ServiceImpl,
} from '@connectrpc/connect';
import {
  RestaurantCatalogueService,
  SearchRestaurantsResponseSchema,
  type SearchRestaurantsRequest,
} from '@fd/contracts/fooddelivery/restaurant/v1/catalogue_pb.js';
import {
  DayOfWeek,
  RestaurantSchema,
  type Restaurant,
} from '@fd/contracts/fooddelivery/restaurant/v1/events_pb.js';

export const cantinaId = '0199a5d0-0000-7000-8000-0000000000b4';

export const cantina: Restaurant = create(RestaurantSchema, {
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
    { dayOfWeek: DayOfWeek.TUESDAY, opensAt: '11:30', closesAt: '15:00' },
    { dayOfWeek: DayOfWeek.SUNDAY, opensAt: '19:00', closesAt: '01:00' },
  ],
  minimumOrderInCents: 3500n,
  currency: 'BRL',
  menuItems: [
    {
      menuItemId: '0199a5d0-0000-7000-8000-000000000d07',
      name: 'Lasanha',
      priceInCents: 9_007_199_254_740_993n,
      isAvailable: true,
    },
    {
      menuItemId: '0199a5d0-0000-7000-8000-000000000d08',
      name: 'Tiramisu',
      priceInCents: 2100n,
      isAvailable: false,
    },
  ],
});

export class FakeRestaurantCatalogueService {
  readonly searchRequests: SearchRestaurantsRequest[] = [];
  readonly receivedCorrelationIds: string[] = [];
  readonly receivedAuthorizations: (string | null)[] = [];
  readonly restaurants = new Map<string, Restaurant>([[cantinaId, cantina]]);
  searchResponse: MessageInitShape<typeof SearchRestaurantsResponseSchema> = {};
  failure: ConnectError | undefined = undefined;

  implementation(): ServiceImpl<typeof RestaurantCatalogueService> {
    return {
      searchRestaurants: (request, context) => {
        this.#receive(context);
        this.searchRequests.push(request);
        return create(SearchRestaurantsResponseSchema, this.searchResponse);
      },
      getPublicRestaurant: (request, context) => {
        this.#receive(context);
        const restaurant = this.restaurants.get(request.restaurantId);
        if (restaurant === undefined) throw new ConnectError(request.restaurantId, Code.NotFound);
        return { restaurant };
      },
    };
  }

  client(): Client<typeof RestaurantCatalogueService> {
    return createClient(
      RestaurantCatalogueService,
      createRouterTransport(({ service }) => {
        service(RestaurantCatalogueService, this.implementation());
      }),
    );
  }

  #receive(context: HandlerContext): void {
    this.receivedCorrelationIds.push(context.requestHeader.get('x-correlation-id') ?? '');
    this.receivedAuthorizations.push(context.requestHeader.get('authorization'));
    if (this.failure !== undefined) throw this.failure;
  }
}
