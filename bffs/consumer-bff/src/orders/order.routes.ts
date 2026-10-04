import type { Client } from '@connectrpc/connect';
import type { OrderService } from '@fd/contracts/fooddelivery/order/v1/service_pb.js';
import type { FastifyPluginCallbackZod } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { problemDetailsSchema } from '../http/problem-details.adapter.ts';
import {
  requireServiceAccess,
  serviceCallOptions,
  type RoutesServer,
  type ServiceAccess,
} from '../http/service-access.adapter.ts';
import { orderViewSchema, toOrderView } from './order-view.message-mapper.ts';

export interface OrderRoutesSettings {
  readonly orderService: Client<typeof OrderService>;
  readonly serviceAccess: ServiceAccess;
}

const problemResponse = {
  content: { 'application/problem+json': { schema: problemDetailsSchema } },
};
const problemResponses = { '4xx': problemResponse, '5xx': problemResponse };
const orderServiceAudience = 'order-service';

const placeOrderSchema = {
  headers: z.object({ 'idempotency-key': z.uuid() }),
  body: z.object({
    restaurantId: z.uuid(),
    lineItems: z.array(z.object({ menuItemId: z.uuid(), quantity: z.int32() })),
    deliveryAddress: z.object({
      street: z.string(),
      number: z.string(),
      city: z.string(),
      postalCode: z.string(),
    }),
    paymentToken: z.string(),
  }),
  response: { 201: z.object({ orderId: z.uuid() }), ...problemResponses },
};

const getOrderSchema = {
  params: z.object({ orderId: z.uuid() }),
  response: { 200: orderViewSchema, ...problemResponses },
};

function registerPlaceOrder(server: RoutesServer, settings: OrderRoutesSettings): void {
  server.post('/v1/orders', { schema: placeOrderSchema }, async (request, reply) => {
    const { headers, body } = request;
    const { street, number, city, postalCode } = body.deliveryAddress;
    const placed = await settings.orderService.placeOrder(
      {
        idempotencyKey: headers['idempotency-key'].toLowerCase(),
        restaurantId: body.restaurantId,
        lineItems: body.lineItems.map(({ menuItemId, quantity }) => ({ menuItemId, quantity })),
        deliveryAddress: { street, number, city, postalCode },
        paymentToken: body.paymentToken,
      },
      serviceCallOptions(request),
    );
    return reply
      .code(201)
      .header('location', `/v1/orders/${placed.orderId}`)
      .send({ orderId: placed.orderId });
  });
}

function registerGetOrder(server: RoutesServer, settings: OrderRoutesSettings): void {
  server.get('/v1/orders/:orderId', { schema: getOrderSchema }, async (request) => {
    const order = await settings.orderService.getOrder(
      { orderId: request.params.orderId },
      serviceCallOptions(request),
    );
    return toOrderView(order);
  });
}

export const orderRoutes: FastifyPluginCallbackZod<OrderRoutesSettings> = (
  server,
  settings,
  done,
) => {
  requireServiceAccess(server, settings.serviceAccess, orderServiceAudience);
  registerPlaceOrder(server, settings);
  registerGetOrder(server, settings);
  done();
};
