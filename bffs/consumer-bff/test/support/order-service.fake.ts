import { setTimeout as delay } from 'node:timers/promises';
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
  OrderService,
  type GetOrderResponse,
  type PlaceOrderRequest,
} from '@fd/contracts/fooddelivery/order/v1/service_pb.js';

export const placedOrderId = '0199a5d0-0000-7000-8000-0000000000a1';

export class FakeOrderService {
  readonly placeOrderRequests: PlaceOrderRequest[] = [];
  readonly receivedCorrelationIds: string[] = [];
  readonly orders = new Map<string, GetOrderResponse>();
  failure: ConnectError | undefined = undefined;
  responseDelayInMilliseconds = 0;

  implementation(): ServiceImpl<typeof OrderService> {
    return {
      placeOrder: async (request, context) => {
        await this.#receive(context);
        this.placeOrderRequests.push(request);
        return { orderId: placedOrderId };
      },
      getOrder: async (request, context) => {
        await this.#receive(context);
        const order = this.orders.get(request.orderId);
        if (order === undefined) throw new ConnectError(request.orderId, Code.NotFound);
        return order;
      },
    };
  }

  client(): Client<typeof OrderService> {
    return createClient(
      OrderService,
      createRouterTransport(({ service }) => {
        service(OrderService, this.implementation());
      }),
    );
  }

  async #receive(context: HandlerContext): Promise<void> {
    this.receivedCorrelationIds.push(context.requestHeader.get('x-correlation-id') ?? '');
    await delay(this.responseDelayInMilliseconds);
    if (this.failure !== undefined) throw this.failure;
  }
}
