import { fastifyConnectPlugin } from '@connectrpc/connect-fastify';
import { OrderService } from '@fd/contracts/fooddelivery/order/v1/service_pb.js';
import { fastify, type FastifyInstance } from 'fastify';
import { recordSpans, traceparentOf } from '@fd/chassis-testing';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { startConsumerBff, type RunningConsumerBff } from '../src/main.ts';
import { FakeOrderService, placedOrderId } from './support/order-service.fake.ts';

const orderServiceTimeoutInMilliseconds = 300;
const spans = recordSpans();

let orderService: FakeOrderService;
let orderServer: FastifyInstance;
let consumerBff: RunningConsumerBff;

function placeOrder(): Promise<Response> {
  return fetch(`${consumerBff.url}/v1/orders`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'idempotency-key': '0199a5d0-0000-4000-8000-0000000000f1',
      'x-consumer-id': '0199a5d0-0000-7000-8000-0000000000c1',
    },
    body: JSON.stringify({
      restaurantId: '0199a5d0-0000-7000-8000-0000000000b1',
      lineItems: [{ menuItemId: '0199a5d0-0000-7000-8000-0000000000d1', quantity: 2 }],
      deliveryAddress: {
        street: 'Rua Augusta',
        number: '1500',
        city: 'Sao Paulo',
        postalCode: '01304-001',
      },
      paymentToken: 'tok_visa_4242',
    }),
  });
}

beforeAll(async () => {
  orderService = new FakeOrderService();
  orderServer = fastify();
  await orderServer.register(fastifyConnectPlugin, {
    routes: (router) => router.service(OrderService, orderService.implementation()),
  });
  const orderServiceUrl = await orderServer.listen({ host: '127.0.0.1', port: 0 });
  consumerBff = await startConsumerBff({
    orderServiceUrl,
    orderServiceTimeoutInMilliseconds,
    host: '127.0.0.1',
    port: 0,
    logLevel: 'silent',
  });
});

afterEach(() => {
  orderService.responseDelayInMilliseconds = 0;
});

afterAll(async () => {
  await consumerBff.stop();
  await orderServer.close();
});

describe('consumer bff', () => {
  it('places an order through the order service over HTTP', async () => {
    const response = await placeOrder();

    expect(response.status).toBe(201);
    expect(await response.json()).toEqual({ orderId: placedOrderId });
  });

  it('sends the span of each order service call as traceparent', async () => {
    await placeOrder();

    const call = spans.spansNamed('fooddelivery.order.v1.OrderService/PlaceOrder').at(-1);
    expect(orderService.receivedTraceparents.at(-1)).toBe(traceparentOf(call));
  });

  it('answers a gateway timeout problem when the order service misses its deadline', async () => {
    orderService.responseDelayInMilliseconds = orderServiceTimeoutInMilliseconds * 3;

    const response = await placeOrder();

    expect(response.status).toBe(504);
    expect(response.headers.get('content-type')).toBe('application/problem+json; charset=utf-8');
  });

  it('answers its health endpoint', async () => {
    const response = await fetch(`${consumerBff.url}/health`);

    expect(response.status).toBe(200);
  });
});
