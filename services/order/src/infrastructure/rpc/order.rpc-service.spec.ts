import { Writable } from 'node:stream';
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
import { left, right } from '@fd/domain';
import {
  OrderService,
  OrderStatus,
  PlaceOrderFailureSchema,
  PlaceOrderRequestSchema,
  type PlaceOrderRequest,
} from '@fd/contracts/fooddelivery/order/v1/service_pb.js';
import { createLogger, runInRootSpan } from '@fd/chassis-observability';
import { createRpcCorrelation } from '@fd/chassis-rpc';
import { recordSpans } from '@fd/chassis-testing';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { FakeClock } from '../../../test/support/clock.fake.ts';
import { FakeIdGenerator } from '../../../test/support/id-generator.fake.ts';
import { InMemoryUnitOfWork } from '../../../test/support/in-memory-unit-of-work.adapter.ts';
import {
  deliveryFeeInCents,
  fridayEveningHours,
  guaranaId,
  margheritaId,
  pizzeriaMenu,
  unwrap,
} from '../../../test/support/order.builder.ts';
import { sagaTimeoutsInMilliseconds } from '../../../test/support/place-order-saga.builder.ts';
import { PlaceOrderCommandHandler } from '#application/commands/place-order/place-order.command-handler.ts';
import { GetOrderQueryHandler } from '#application/queries/get-order/get-order.query-handler.ts';
import type { RestaurantMenu } from '#domain/menu/restaurant-menu.value-object.ts';
import { parseOrderId } from '#domain/order/order-id.value-object.ts';
import { createOrderRpcService } from './order.rpc-service.ts';

const generatedCorrelationId = '0199a5d0-0000-7000-8000-0000000000e9';
const consumerId = '0199a5d0-0000-7000-8000-0000000000c1';
const spans = recordSpans();
const verifiedAccessTokens = new Map([
  ['consumer-a-token', { subject: consumerId, roles: ['consumer'] }],
  ['consumer-b-token', { subject: '0199a5d0-0000-7000-8000-0000000000c2', roles: ['consumer'] }],
  ['staff-token', { subject: '0199a5d0-0000-7000-8000-0000000000e1', roles: ['restaurant_staff'] }],
]);

type PlaceOrderRequestInit = Exclude<
  MessageInitShape<typeof PlaceOrderRequestSchema>,
  PlaceOrderRequest
>;

let unitOfWork: InMemoryUnitOfWork;
let idGenerator: FakeIdGenerator;
let client: Client<typeof OrderService>;
let logEntries: Record<string, unknown>[];

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

function captureLogger(): ReturnType<typeof createLogger> {
  const destination = new Writable({
    write(chunk: Buffer, encoding, callback) {
      const parsed: unknown = JSON.parse(chunk.toString());
      logEntries.push(typeof parsed === 'object' && parsed !== null ? { ...parsed } : {});
      callback();
    },
  });
  return createLogger({ serviceName: 'order-service', level: 'info' }, destination);
}

function placeOrderRequest(overrides: PlaceOrderRequestInit = {}): PlaceOrderRequest {
  return create(PlaceOrderRequestSchema, {
    idempotencyKey: 'checkout-7f3a',
    restaurantId: pizzeriaMenu.restaurantId,
    lineItems: [
      { menuItemId: margheritaId, quantity: 2 },
      { menuItemId: guaranaId, quantity: 1 },
    ],
    deliveryAddress: {
      street: 'Rua Augusta',
      number: '1500',
      city: 'Sao Paulo',
      postalCode: '01304-001',
    },
    paymentToken: 'tok_visa_4242',
    ...overrides,
  });
}

function clientOf(
  accessToken: string,
  routerInterceptors: Interceptor[],
): Client<typeof OrderService> {
  const transport = createRouterTransport(
    ({ service }) => {
      service(
        OrderService,
        createOrderRpcService({
          placeOrder: new PlaceOrderCommandHandler({
            unitOfWork,
            clock: new FakeClock(),
            idGenerator,
            sagaTimeoutsInMilliseconds,
            deliveryFeeInCents,
          }),
          getOrder: new GetOrderQueryHandler(unitOfWork.orders),
        }),
      );
    },
    {
      router: { interceptors: routerInterceptors },
      transport: { interceptors: [sendingAccessToken(accessToken)] },
    },
  );
  return createClient(OrderService, transport);
}

function clientFor(accessToken: string): Client<typeof OrderService> {
  const correlation = createRpcCorrelation({
    logger: captureLogger(),
    generateCorrelationId: () => generatedCorrelationId,
  });
  return clientOf(accessToken, [correlation, createAccessTokenInterceptor(verify)]);
}

beforeEach(() => {
  unitOfWork = new InMemoryUnitOfWork();
  idGenerator = new FakeIdGenerator();
  logEntries = [];
  client = clientFor('consumer-a-token');
});

describe('OrderService.PlaceOrder', () => {
  it('places an order for the consumer of the access token, who becomes its actor, ignoring a consumer id in the request', async () => {
    const response = await client.placeOrder(
      placeOrderRequest({ consumerId: '0199a5d0-0000-7000-8000-0000000000c2' }),
    );

    expect(response.orderId).toBe('0199a5d0-0000-7000-8000-0000000000a1');
    expect(unitOfWork.executedMetadata).toEqual([
      {
        correlationId: generatedCorrelationId,
        causationId: undefined,
        actorId: consumerId,
        actorType: 'consumer',
      },
    ]);
    const storedOrder = await unitOfWork.orders.findById(unwrap(parseOrderId(response.orderId)));
    expect(storedOrder?.toSnapshot().consumerId).toBe(consumerId);
  });

  it('refuses a caller without the consumer role as permission denied', async () => {
    await expect(clientFor('staff-token').placeOrder(placeOrderRequest())).rejects.toMatchObject({
      code: Code.PermissionDenied,
    });
    expect(unitOfWork.executedMetadata).toEqual([]);
  });

  it('refuses a call whose access token was never verified as unauthenticated', async () => {
    const unverifiedClient = clientOf('consumer-a-token', []);

    await expect(unverifiedClient.placeOrder(placeOrderRequest())).rejects.toMatchObject({
      code: Code.Unauthenticated,
    });
    await expect(
      unverifiedClient.getOrder({ orderId: generatedCorrelationId }),
    ).rejects.toMatchObject({ code: Code.Unauthenticated });
  });

  it('keeps the same Idempotency-Key of two consumers apart', async () => {
    const forConsumerA = await client.placeOrder(placeOrderRequest());
    const forConsumerB = await clientFor('consumer-b-token').placeOrder(placeOrderRequest());

    expect(forConsumerB.orderId).not.toBe(forConsumerA.orderId);
    expect(unitOfWork.executedMetadata.map(({ actorId }) => actorId)).toEqual([
      consumerId,
      '0199a5d0-0000-7000-8000-0000000000c2',
    ]);
  });

  it('adds the placed order id to the active span', async () => {
    const response = await runInRootSpan('placing', () => client.placeOrder(placeOrderRequest()));

    expect(spans.spansNamed('placing').at(-1)?.attributes).toEqual({
      'fooddelivery.order.id': response.orderId,
    });
  });

  it('keeps the correlation id sent by the caller', async () => {
    const correlationId = '0199a5d0-0000-7000-8000-0000000000e2';

    await client.placeOrder(placeOrderRequest(), {
      headers: { 'x-correlation-id': correlationId },
    });

    expect(unitOfWork.executedMetadata[0]?.correlationId).toBe(correlationId);
  });

  it('replaces a correlation id that is not a uuid with a generated one and echoes it', async () => {
    let echoedCorrelationId: string | null = null;

    await client.placeOrder(placeOrderRequest(), {
      headers: { 'x-correlation-id': 'not-a-uuid' },
      onHeader: (headers) => {
        echoedCorrelationId = headers.get('x-correlation-id');
      },
    });

    expect(unitOfWork.executedMetadata[0]?.correlationId).toBe(generatedCorrelationId);
    expect(echoedCorrelationId).toBe(generatedCorrelationId);
  });

  it('hides an unexpected failure from the client and logs it with the correlation id', async () => {
    const correlationId = '0199a5d0-0000-7000-8000-0000000000e2';
    vi.spyOn(unitOfWork, 'execute').mockRejectedValue(
      new Error('relation "orders" does not exist'),
    );

    await expect(
      client.placeOrder(placeOrderRequest(), { headers: { 'x-correlation-id': correlationId } }),
    ).rejects.toMatchObject({ code: Code.Internal, rawMessage: 'internal error' });

    expect(logEntries).toHaveLength(1);
    expect(logEntries[0]).toMatchObject({
      level: 50,
      correlationId,
      procedure: 'fooddelivery.order.v1.OrderService/PlaceOrder',
      err: { message: 'relation "orders" does not exist' },
    });
  });

  it('echoes the correlation id on an unexpected failure', async () => {
    vi.spyOn(unitOfWork, 'execute').mockRejectedValue(new Error('connection lost'));

    const failure = await client.placeOrder(placeOrderRequest()).catch((error: unknown) => error);

    expect(ConnectError.from(failure).metadata.get('x-correlation-id')).toBe(
      generatedCorrelationId,
    );
  });

  it('echoes the correlation id on a failure the client is meant to see', async () => {
    const correlationId = '0199a5d0-0000-7000-8000-0000000000e2';

    const failure = await client
      .placeOrder(placeOrderRequest({ restaurantId: 'pizzeria' }), {
        headers: { 'x-correlation-id': correlationId },
      })
      .catch((error: unknown) => error);

    expect(ConnectError.from(failure)).toMatchObject({ code: Code.InvalidArgument });
    expect(ConnectError.from(failure).metadata.get('x-correlation-id')).toBe(correlationId);
  });

  it('canonicalises an uppercase correlation id from the caller', async () => {
    const correlationId = '0199A5D0-0000-7000-8000-0000000000E2';

    await client.placeOrder(placeOrderRequest(), {
      headers: { 'x-correlation-id': correlationId },
    });

    expect(unitOfWork.executedMetadata[0]?.correlationId).toBe(correlationId.toLowerCase());
  });

  it('does not log failures the client is meant to see', async () => {
    await expect(client.getOrder({ orderId: 'order-1' })).rejects.toMatchObject({
      code: Code.InvalidArgument,
    });

    expect(logEntries).toHaveLength(0);
  });

  it('answers a retried request with the same order', async () => {
    const first = await client.placeOrder(placeOrderRequest());
    const retried = await client.placeOrder(placeOrderRequest());

    expect(retried.orderId).toBe(first.orderId);
    expect(unitOfWork.orders.rows.size).toBe(1);
  });

  it('answers a lowercase retry of an uppercase placement with the same order', async () => {
    const lowercase = placeOrderRequest();
    const uppercase = placeOrderRequest({
      restaurantId: lowercase.restaurantId.toUpperCase(),
      lineItems: lowercase.lineItems.map((lineItem) => ({
        menuItemId: lineItem.menuItemId.toUpperCase(),
        quantity: lineItem.quantity,
      })),
    });

    const first = await client.placeOrder(uppercase);
    const retried = await client.placeOrder(lowercase);

    expect(retried.orderId).toBe(first.orderId);
  });

  it.each<{ readonly invalidPart: string; readonly overrides: PlaceOrderRequestInit }>([
    { invalidPart: 'a blank idempotency key', overrides: { idempotencyKey: ' ' } },
    {
      invalidPart: 'a menu item id that is not a uuid',
      overrides: { lineItems: [{ menuItemId: 'margherita', quantity: 1 }] },
    },
    { invalidPart: 'a restaurant id that is not a uuid', overrides: { restaurantId: 'pizzeria' } },
    {
      invalidPart: 'the same menu item on two lines',
      overrides: {
        lineItems: [
          { menuItemId: margheritaId, quantity: 1 },
          { menuItemId: margheritaId, quantity: 2 },
        ],
      },
    },
    {
      invalidPart: 'a blank street',
      overrides: {
        deliveryAddress: {
          street: ' ',
          number: '1500',
          city: 'Sao Paulo',
          postalCode: '01304-001',
        },
      },
    },
    { invalidPart: 'an empty order', overrides: { lineItems: [] } },
    {
      invalidPart: 'a quantity of zero',
      overrides: { lineItems: [{ menuItemId: margheritaId, quantity: 0 }] },
    },
    { invalidPart: 'a blank payment token', overrides: { paymentToken: '' } },
  ])('rejects $invalidPart as an invalid argument', async ({ overrides }) => {
    await expect(client.placeOrder(placeOrderRequest(overrides))).rejects.toMatchObject({
      code: Code.InvalidArgument,
    });
  });

  it('rejects a request without a delivery address as an invalid argument', async () => {
    const request = placeOrderRequest();
    delete request.deliveryAddress;

    await expect(client.placeOrder(request)).rejects.toMatchObject({
      code: Code.InvalidArgument,
    });
  });

  it('rejects a restaurant without a menu replica as a failed precondition', async () => {
    const request = placeOrderRequest({ restaurantId: '0199a5d0-0000-7000-8000-0000000000ff' });

    await expect(client.placeOrder(request)).rejects.toMatchObject({
      code: Code.FailedPrecondition,
    });
  });

  it('rejects a menu item that is not on the menu as a failed precondition', async () => {
    const request = placeOrderRequest({
      lineItems: [{ menuItemId: '0199a5d0-0000-7000-8000-0000000000ff', quantity: 1 }],
    });

    await expect(client.placeOrder(request)).rejects.toMatchObject({
      code: Code.FailedPrecondition,
    });
  });

  it('rejects a reused key carrying a different request as a failed precondition', async () => {
    await client.placeOrder(placeOrderRequest());

    await expect(
      client.placeOrder(placeOrderRequest({ paymentToken: 'tok_mastercard_4444' })),
    ).rejects.toMatchObject({ code: Code.FailedPrecondition });
  });

  it.each<{ readonly reason: string; readonly overrides: PlaceOrderRequestInit }>([
    { reason: 'InvalidPlaceOrderRequest', overrides: { restaurantId: 'pizzeria' } },
    {
      reason: 'DuplicateMenuItem',
      overrides: {
        lineItems: [
          { menuItemId: margheritaId, quantity: 1 },
          { menuItemId: margheritaId, quantity: 2 },
        ],
      },
    },
    {
      reason: 'UnknownMenuItem',
      overrides: {
        lineItems: [{ menuItemId: '0199a5d0-0000-7000-8000-0000000000ff', quantity: 1 }],
      },
    },
    { reason: 'EmptyOrder', overrides: { lineItems: [] } },
    {
      reason: 'InvalidQuantity',
      overrides: { lineItems: [{ menuItemId: margheritaId, quantity: 0 }] },
    },
    {
      reason: 'IncompleteDeliveryAddress',
      overrides: {
        deliveryAddress: {
          street: ' ',
          number: '1500',
          city: 'Sao Paulo',
          postalCode: '01304-001',
        },
      },
    },
    {
      reason: 'UnknownRestaurant',
      overrides: { restaurantId: '0199a5d0-0000-7000-8000-0000000000ff' },
    },
  ])('names the $reason failure in a typed error detail', async ({ reason, overrides }) => {
    const failure = await client
      .placeOrder(placeOrderRequest(overrides))
      .catch((error: unknown) => error);

    expect(ConnectError.from(failure).findDetails(PlaceOrderFailureSchema)).toMatchObject([
      { reason },
    ]);
  });

  it.each<{ readonly reason: string; readonly menu: RestaurantMenu }>([
    {
      reason: 'UnavailableMenuItem',
      menu: {
        ...pizzeriaMenu,
        version: 3,
        items: pizzeriaMenu.items.map((item) => ({ ...item, isAvailable: false })),
      },
    },
    {
      reason: 'RestaurantClosed',
      menu: { ...pizzeriaMenu, version: 3, openingHours: fridayEveningHours },
    },
    {
      reason: 'MinimumOrderNotReached',
      menu: { ...pizzeriaMenu, version: 3, minimumOrderInCents: 9801n },
    },
  ])('answers $reason from the menu replica as a failed precondition', async ({ reason, menu }) => {
    await unitOfWork.menus.saveIfNewer(menu);

    const failure = ConnectError.from(
      await client.placeOrder(placeOrderRequest()).catch((error: unknown) => error),
    );

    expect(failure.code).toBe(Code.FailedPrecondition);
    expect(failure.findDetails(PlaceOrderFailureSchema)).toMatchObject([{ reason }]);
  });

  it('names a reused idempotency key in a typed error detail', async () => {
    await client.placeOrder(placeOrderRequest());

    const failure = await client
      .placeOrder(placeOrderRequest({ paymentToken: 'tok_mastercard_4444' }))
      .catch((error: unknown) => error);

    expect(ConnectError.from(failure).findDetails(PlaceOrderFailureSchema)).toMatchObject([
      { reason: 'IdempotencyKeyReused' },
    ]);
  });
});

describe('OrderService.GetOrder', () => {
  it('returns a placed order with its status, frozen line items, delivery fee and total', async () => {
    const { orderId } = await client.placeOrder(placeOrderRequest());

    const response = await client.getOrder({ orderId });

    expect(response).toMatchObject({
      orderId,
      status: OrderStatus.APPROVAL_PENDING,
      lineItems: [
        { menuItemId: margheritaId, name: 'Margherita', unitPriceInCents: 4500n, quantity: 2 },
        { menuItemId: guaranaId, name: 'Guarana', unitPriceInCents: 800n, quantity: 1 },
      ],
      deliveryFeeInCents: 800n,
      totalInCents: 10600n,
      currency: 'BRL',
    });
  });

  it('adds the requested order id to the active span', async () => {
    const { orderId } = await client.placeOrder(placeOrderRequest());

    await runInRootSpan('tracking', () => client.getOrder({ orderId }));

    expect(spans.spansNamed('tracking').at(-1)?.attributes).toEqual({
      'fooddelivery.order.id': orderId,
    });
  });

  it('reports the order of another consumer as not found', async () => {
    const { orderId } = await client.placeOrder(placeOrderRequest());

    await expect(clientFor('consumer-b-token').getOrder({ orderId })).rejects.toMatchObject({
      code: Code.NotFound,
    });
  });

  it('refuses a caller without the consumer role as permission denied', async () => {
    const { orderId } = await client.placeOrder(placeOrderRequest());

    await expect(clientFor('staff-token').getOrder({ orderId })).rejects.toMatchObject({
      code: Code.PermissionDenied,
    });
  });

  it('reports an unknown order as not found', async () => {
    await expect(
      client.getOrder({ orderId: '0199a5d0-0000-7000-8000-0000000000ff' }),
    ).rejects.toMatchObject({ code: Code.NotFound });
  });

  it('rejects an order id that is not a uuid as an invalid argument', async () => {
    await expect(client.getOrder({ orderId: 'order-1' })).rejects.toMatchObject({
      code: Code.InvalidArgument,
    });
  });
});
