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
  RestaurantService,
  type GetRestaurantResponse,
  type ListMembershipsResponse,
  type OnboardRestaurantRequest,
  type ReviseMenuRequest,
} from '@fd/contracts/fooddelivery/restaurant/v1/service_pb.js';

export const onboardedRestaurantId = '0199a5d0-0000-7000-8000-0000000000b1';

export class FakeRestaurantService {
  readonly onboardRestaurantRequests: OnboardRestaurantRequest[] = [];
  readonly reviseMenuRequests: ReviseMenuRequest[] = [];
  readonly receivedCorrelationIds: string[] = [];
  readonly receivedAuthorizations: (string | null)[] = [];
  readonly receivedTraceparents: (string | null)[] = [];
  restaurant: GetRestaurantResponse | undefined = undefined;
  memberships: ListMembershipsResponse | undefined = undefined;
  failure: ConnectError | undefined = undefined;

  implementation(): ServiceImpl<typeof RestaurantService> {
    return {
      onboardRestaurant: (request, context) => {
        this.#receive(context);
        this.onboardRestaurantRequests.push(request);
        return { restaurantId: onboardedRestaurantId };
      },
      reviseMenu: (request, context) => {
        this.#receive(context);
        this.reviseMenuRequests.push(request);
        return { version: 2 };
      },
      getRestaurant: (request, context) => {
        this.#receive(context);
        if (this.restaurant === undefined) {
          throw new ConnectError(request.restaurantId, Code.NotFound);
        }
        return this.restaurant;
      },
      listMemberships: (request, context) => {
        this.#receive(context);
        return this.memberships ?? {};
      },
    };
  }

  client(): Client<typeof RestaurantService> {
    return createClient(
      RestaurantService,
      createRouterTransport(({ service }) => {
        service(RestaurantService, this.implementation());
      }),
    );
  }

  #receive(context: HandlerContext): void {
    this.receivedCorrelationIds.push(context.requestHeader.get('x-correlation-id') ?? '');
    this.receivedAuthorizations.push(context.requestHeader.get('authorization'));
    this.receivedTraceparents.push(context.requestHeader.get('traceparent'));
    if (this.failure !== undefined) throw this.failure;
  }
}
