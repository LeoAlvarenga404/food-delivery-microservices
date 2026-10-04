import { Writable } from 'node:stream';
import { create, fromJson } from '@bufbuild/protobuf';
import { Code, ConnectError } from '@connectrpc/connect';
import { createLogger, type Logger } from '@fd/chassis-observability';
import { OrderRejectionReason } from '@fd/contracts/fooddelivery/order/v1/events_pb.js';
import {
  GetOrderResponseSchema,
  OrderStatus,
  PlaceOrderFailureSchema,
} from '@fd/contracts/fooddelivery/order/v1/service_pb.js';
import type { LightMyRequestResponse } from 'fastify';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { fakeServiceAccess } from '../../test/support/service-access.fake.ts';
import { FakeOrderService, placedOrderId } from '../../test/support/order-service.fake.ts';
import { createConsumerBffServer, type ConsumerBffServer } from '../main.ts';

const idempotencyKey = '0199a5d0-0000-4000-8000-0000000000f1';
const restaurantId = '0199a5d0-0000-7000-8000-0000000000b1';
const margheritaId = '0199a5d0-0000-7000-8000-0000000000d1';
const callerCorrelationId = '0199a5d0-0000-7000-8000-0000000000e2';
const generatedCorrelationId = '0199a5d0-0000-7000-8000-0000000000e9';
const consumerAuthorization = { authorization: 'Bearer consumer-token' };
const placementHeaders = { 'idempotency-key': idempotencyKey, ...consumerAuthorization };

let orderService: FakeOrderService;
let server: ConsumerBffServer;
let logEntries: Record<string, unknown>[];

function captureLogger(): Logger {
  const destination = new Writable({
    write(chunk: Buffer, encoding, callback) {
      const parsed: unknown = JSON.parse(chunk.toString());
      logEntries.push(typeof parsed === 'object' && parsed !== null ? { ...parsed } : {});
      callback();
    },
  });
  return createLogger({ serviceName: 'consumer-bff', level: 'info' }, destination);
}

function placeOrderBody(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    restaurantId,
    lineItems: [{ menuItemId: margheritaId, quantity: 2 }],
    deliveryAddress: {
      street: 'Rua Augusta',
      number: '1500',
      city: 'Sao Paulo',
      postalCode: '01304-001',
    },
    paymentToken: 'tok_visa_4242',
    ...overrides,
  };
}

function placeOrder(
  headers: Record<string, string>,
  body: Record<string, unknown> = placeOrderBody(),
): Promise<LightMyRequestResponse> {
  return server.inject({ method: 'POST', url: '/v1/orders', headers, payload: body });
}

beforeEach(async () => {
  orderService = new FakeOrderService();
  logEntries = [];
  server = await createConsumerBffServer({
    orderService: orderService.client(),
    serviceAccess: fakeServiceAccess,
    logger: captureLogger(),
    generateCorrelationId: () => generatedCorrelationId,
  });
});

afterEach(() => server.close());

describe('POST /v1/orders', () => {
  it('places the order with the order service token of the consumer and answers with its location', async () => {
    const response = await placeOrder(placementHeaders);

    expect(response.statusCode).toBe(201);
    expect(orderService.receivedAuthorizations).toEqual(['Bearer order-service-token']);
    expect(response.headers.location).toBe(`/v1/orders/${placedOrderId}`);
    expect(response.json()).toEqual({ orderId: placedOrderId });
    expect(orderService.placeOrderRequests).toMatchObject([
      {
        idempotencyKey,
        restaurantId,
        lineItems: [{ menuItemId: margheritaId, quantity: 2 }],
        deliveryAddress: {
          street: 'Rua Augusta',
          number: '1500',
          city: 'Sao Paulo',
          postalCode: '01304-001',
        },
        paymentToken: 'tok_visa_4242',
      },
    ]);
  });

  it.each([
    { scenario: 'without a token', headers: { 'idempotency-key': idempotencyKey }, status: 401 },
    {
      scenario: 'with a token it cannot exchange',
      headers: { 'idempotency-key': idempotencyKey, authorization: 'Bearer expired-token' },
      status: 401,
    },
    {
      scenario: 'with the token of a caller who is not a consumer',
      headers: { 'idempotency-key': idempotencyKey, authorization: 'Bearer staff-token' },
      status: 403,
    },
  ])(
    'answers a placement $scenario with a $status problem before validating it',
    async ({ headers, status }) => {
      const response = await placeOrder(headers, placeOrderBody({ restaurantId: 'pizzeria' }));

      expect(response.statusCode).toBe(status);
      expect(response.headers['content-type']).toBe('application/problem+json; charset=utf-8');
      expect(response.json()).toMatchObject({ type: 'about:blank', status });
      expect(orderService.receivedCorrelationIds).toHaveLength(0);
    },
  );

  it('forwards an uppercase Idempotency-Key to the order service in lowercase', async () => {
    await placeOrder({ ...placementHeaders, 'idempotency-key': idempotencyKey.toUpperCase() });

    expect(orderService.placeOrderRequests).toMatchObject([{ idempotencyKey }]);
  });

  it.each([
    { scenario: 'the caller sent', sent: callerCorrelationId, expected: callerCorrelationId },
    {
      scenario: 'the caller sent in uppercase, in lowercase',
      sent: callerCorrelationId.toUpperCase(),
      expected: callerCorrelationId,
    },
    { scenario: 'the bff generated', sent: undefined, expected: generatedCorrelationId },
  ])(
    'forwards the correlation id $scenario to the order service on placement',
    async ({ sent, expected }) => {
      const response = await placeOrder(
        sent === undefined ? placementHeaders : { ...placementHeaders, 'x-correlation-id': sent },
      );

      expect(response.headers['x-correlation-id']).toBe(expected);
      expect(orderService.receivedCorrelationIds).toEqual([expected]);
    },
  );

  it('answers a placement with an order id that is not a uuid as an internal error without echoing it', async () => {
    orderService.answeredOrderId = 'postgres://order:pw@db/order';

    const response = await placeOrder(placementHeaders);

    expect(response.statusCode).toBe(500);
    expect(response.headers['content-type']).toBe('application/problem+json; charset=utf-8');
    expect(response.json()).toEqual({
      type: 'about:blank',
      title: 'Internal Server Error',
      status: 500,
    });
  });

  it.each([
    {
      invalidPart: 'a missing Idempotency-Key',
      headers: consumerAuthorization,
      body: placeOrderBody(),
    },
    {
      invalidPart: 'an Idempotency-Key that is not a uuid',
      headers: { ...placementHeaders, 'idempotency-key': 'checkout-1' },
      body: placeOrderBody(),
    },
    {
      invalidPart: 'an Idempotency-Key longer than a uuid',
      headers: { ...placementHeaders, 'idempotency-key': `${idempotencyKey}0` },
      body: placeOrderBody(),
    },
    {
      invalidPart: 'a restaurant id that is not a uuid',
      headers: placementHeaders,
      body: placeOrderBody({ restaurantId: 'pizzeria' }),
    },
    {
      invalidPart: 'a menu item id that is not a uuid',
      headers: placementHeaders,
      body: placeOrderBody({ lineItems: [{ menuItemId: 'margherita', quantity: 1 }] }),
    },
    {
      invalidPart: 'a fractional quantity',
      headers: placementHeaders,
      body: placeOrderBody({ lineItems: [{ menuItemId: margheritaId, quantity: 1.5 }] }),
    },
    {
      invalidPart: 'a quantity beyond 32 bits',
      headers: placementHeaders,
      body: placeOrderBody({ lineItems: [{ menuItemId: margheritaId, quantity: 2_147_483_648 }] }),
    },
    {
      invalidPart: 'a missing delivery address',
      headers: placementHeaders,
      body: placeOrderBody({ deliveryAddress: undefined }),
    },
  ])(
    'answers $invalidPart with a bad request problem without calling the order service',
    async ({ headers, body }) => {
      const response = await placeOrder(headers, body);

      expect(response.statusCode).toBe(400);
      expect(response.headers['content-type']).toBe('application/problem+json; charset=utf-8');
      expect(response.json()).toMatchObject({
        type: 'about:blank',
        title: 'Bad Request',
        status: 400,
      });
      expect(orderService.receivedCorrelationIds).toHaveLength(0);
    },
  );

  it.each([
    { code: Code.InvalidArgument, reason: 'DuplicateMenuItem', status: 400, title: 'Bad Request' },
    {
      code: Code.FailedPrecondition,
      reason: 'UnknownMenuItem',
      status: 422,
      title: 'Unprocessable Entity',
    },
    {
      code: Code.FailedPrecondition,
      reason: 'IdempotencyKeyReused',
      status: 422,
      title: 'Unprocessable Entity',
    },
  ])(
    'answers a $reason refusal with a $status problem naming the reason',
    async ({ code, reason, status, title }) => {
      orderService.failure = new ConnectError('refused', code, undefined, [
        { desc: PlaceOrderFailureSchema, value: { reason } },
      ]);

      const response = await placeOrder(placementHeaders);

      expect(response.statusCode).toBe(status);
      expect(response.headers['content-type']).toBe('application/problem+json; charset=utf-8');
      expect(response.json()).toEqual({ type: 'about:blank', title, status, reason });
    },
  );

  it.each([
    { code: Code.Unauthenticated, status: 401 },
    { code: Code.PermissionDenied, status: 403 },
    { code: Code.AlreadyExists, status: 409 },
    { code: Code.Unavailable, status: 503 },
    { code: Code.DeadlineExceeded, status: 504 },
    { code: Code.Internal, status: 500 },
  ])('answers an order service failure with code $code as a $status problem', async (failure) => {
    orderService.failure = new ConnectError('order service failed', failure.code);

    const response = await placeOrder(placementHeaders);

    expect(response.statusCode).toBe(failure.status);
    expect(response.json()).toMatchObject({ type: 'about:blank', status: failure.status });
  });

  it('logs an order service failure with the correlation id and hides it from the caller', async () => {
    orderService.failure = new ConnectError('relation "orders" does not exist', Code.Internal);

    const response = await placeOrder({
      ...placementHeaders,
      'x-correlation-id': callerCorrelationId,
    });

    expect(response.json()).toEqual({
      type: 'about:blank',
      title: 'Internal Server Error',
      status: 500,
    });
    expect(logEntries).toMatchObject([
      {
        level: 50,
        correlationId: callerCorrelationId,
        err: { message: '[internal] relation "orders" does not exist' },
      },
    ]);
  });
});

describe('GET /v1/orders/:orderId', () => {
  it.each([
    { status: OrderStatus.APPROVAL_PENDING, publicStatus: 'APPROVAL_PENDING' },
    { status: OrderStatus.APPROVED, publicStatus: 'APPROVED' },
  ])(
    'answers a $publicStatus order with its frozen line items and amounts in cents as strings',
    async ({ status, publicStatus }) => {
      orderService.orders.set(
        placedOrderId,
        create(GetOrderResponseSchema, {
          orderId: placedOrderId,
          status,
          lineItems: [
            { menuItemId: margheritaId, name: 'Margherita', unitPriceInCents: 4500n, quantity: 2 },
          ],
          totalInCents: 9000n,
          currency: 'BRL',
        }),
      );

      const response = await server.inject({
        method: 'GET',
        headers: consumerAuthorization,
        url: `/v1/orders/${placedOrderId}`,
      });

      expect(response.statusCode).toBe(200);
      expect(response.json()).toEqual({
        orderId: placedOrderId,
        status: publicStatus,
        lineItems: [
          { menuItemId: margheritaId, name: 'Margherita', unitPriceInCents: '4500', quantity: 2 },
        ],
        totalInCents: '9000',
        currency: 'BRL',
      });
    },
  );

  it.each([
    { reason: OrderRejectionReason.CONSUMER_NOT_FOUND, publicReason: 'CONSUMER_NOT_FOUND' },
    { reason: OrderRejectionReason.CONSUMER_BLOCKED, publicReason: 'CONSUMER_BLOCKED' },
    { reason: OrderRejectionReason.TICKET_REFUSED, publicReason: 'TICKET_REFUSED' },
    { reason: OrderRejectionReason.PAYMENT_DECLINED, publicReason: 'PAYMENT_DECLINED' },
    {
      reason: OrderRejectionReason.CONSUMER_VERIFICATION_TIMED_OUT,
      publicReason: 'CONSUMER_VERIFICATION_TIMED_OUT',
    },
    {
      reason: OrderRejectionReason.TICKET_CREATION_TIMED_OUT,
      publicReason: 'TICKET_CREATION_TIMED_OUT',
    },
    {
      reason: OrderRejectionReason.PAYMENT_AUTHORIZATION_TIMED_OUT,
      publicReason: 'PAYMENT_AUTHORIZATION_TIMED_OUT',
    },
  ])(
    'answers an order rejected for $publicReason with that reason',
    async ({ reason, publicReason }) => {
      orderService.orders.set(
        placedOrderId,
        create(GetOrderResponseSchema, {
          orderId: placedOrderId,
          status: OrderStatus.REJECTED,
          rejectionReason: reason,
          totalInCents: 9000n,
          currency: 'BRL',
        }),
      );

      const response = await server.inject({
        method: 'GET',
        headers: consumerAuthorization,
        url: `/v1/orders/${placedOrderId}`,
      });

      expect(response.statusCode).toBe(200);
      expect(response.json()).toMatchObject({ status: 'REJECTED', rejectionReason: publicReason });
    },
  );

  it('answers a rejected order without a reason as an internal error', async () => {
    orderService.orders.set(
      placedOrderId,
      create(GetOrderResponseSchema, {
        orderId: placedOrderId,
        status: OrderStatus.REJECTED,
        currency: 'BRL',
      }),
    );

    const response = await server.inject({
      method: 'GET',
      headers: consumerAuthorization,
      url: `/v1/orders/${placedOrderId}`,
    });

    expect(response.statusCode).toBe(500);
  });

  it('answers a rejected order with an unknown reason as an internal error without echoing it', async () => {
    orderService.orders.set(
      placedOrderId,
      fromJson(GetOrderResponseSchema, {
        orderId: placedOrderId,
        status: OrderStatus.REJECTED,
        rejectionReason: 99,
        currency: 'BRL',
      }),
    );

    const response = await server.inject({
      method: 'GET',
      headers: consumerAuthorization,
      url: `/v1/orders/${placedOrderId}`,
    });

    expect(response.statusCode).toBe(500);
    expect(response.json()).toEqual({
      type: 'about:blank',
      title: 'Internal Server Error',
      status: 500,
    });
  });

  it('keeps an amount beyond 2^53 cents exact', async () => {
    orderService.orders.set(
      placedOrderId,
      create(GetOrderResponseSchema, {
        orderId: placedOrderId,
        status: OrderStatus.APPROVAL_PENDING,
        totalInCents: 9_007_199_254_740_993n,
        currency: 'BRL',
      }),
    );

    const response = await server.inject({
      method: 'GET',
      headers: consumerAuthorization,
      url: `/v1/orders/${placedOrderId}`,
    });

    expect(response.json()).toMatchObject({
      status: 'APPROVAL_PENDING',
      totalInCents: '9007199254740993',
    });
  });

  it('answers an unknown order with a not found problem', async () => {
    const response = await server.inject({
      method: 'GET',
      headers: consumerAuthorization,
      url: `/v1/orders/${placedOrderId}`,
    });

    expect(response.statusCode).toBe(404);
    expect(response.json()).toEqual({ type: 'about:blank', title: 'Not Found', status: 404 });
  });

  it.each([
    { scenario: 'the caller sent', sent: callerCorrelationId, expected: callerCorrelationId },
    { scenario: 'the bff generated', sent: undefined, expected: generatedCorrelationId },
  ])('forwards the correlation id $scenario to the order service on lookup', async (row) => {
    orderService.orders.set(
      placedOrderId,
      create(GetOrderResponseSchema, {
        orderId: placedOrderId,
        status: OrderStatus.APPROVED,
        currency: 'BRL',
      }),
    );

    await server.inject({
      method: 'GET',
      url: `/v1/orders/${placedOrderId}`,
      headers:
        row.sent === undefined
          ? consumerAuthorization
          : { ...consumerAuthorization, 'x-correlation-id': row.sent },
    });

    expect(orderService.receivedCorrelationIds).toEqual([row.expected]);
  });

  it('answers a lookup without a token with an unauthorized problem', async () => {
    const response = await server.inject({ method: 'GET', url: `/v1/orders/${placedOrderId}` });

    expect(response.statusCode).toBe(401);
    expect(response.json()).toEqual({ type: 'about:blank', title: 'Unauthorized', status: 401 });
    expect(orderService.receivedCorrelationIds).toHaveLength(0);
  });

  it('answers an order id that is not a uuid with a bad request problem', async () => {
    const response = await server.inject({
      method: 'GET',
      headers: consumerAuthorization,
      url: '/v1/orders/order-1',
    });

    expect(response.statusCode).toBe(400);
    expect(response.headers['content-type']).toBe('application/problem+json; charset=utf-8');
    expect(response.json()).toMatchObject({ title: 'Bad Request', status: 400 });
    expect(orderService.receivedCorrelationIds).toHaveLength(0);
  });

  it('answers an order without a status as an internal error', async () => {
    orderService.orders.set(
      placedOrderId,
      create(GetOrderResponseSchema, { orderId: placedOrderId, currency: 'BRL' }),
    );

    const response = await server.inject({
      method: 'GET',
      headers: consumerAuthorization,
      url: `/v1/orders/${placedOrderId}`,
    });

    expect(response.statusCode).toBe(500);
  });
});
