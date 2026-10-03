import { Writable } from 'node:stream';
import { create, type MessageInitShape } from '@bufbuild/protobuf';
import {
  Code,
  ConnectError,
  createClient,
  createRouterTransport,
  type Client,
} from '@connectrpc/connect';
import {
  OrderService,
  OrderStatus,
  PlaceOrderFailureSchema,
  PlaceOrderRequestSchema,
  type PlaceOrderRequest,
} from '@fd/contracts/fooddelivery/order/v1/service_pb.js';
import { createLogger } from '@fd/chassis-observability';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { FakeClock } from '../../../test/support/clock.fake.ts';
import { FakeIdGenerator } from '../../../test/support/id-generator.fake.ts';
import { InMemoryUnitOfWork } from '../../../test/support/in-memory-unit-of-work.adapter.ts';
import { guaranaId, margheritaId, pizzeriaMenu } from '../../../test/support/order.builder.ts';
import { PlaceOrderCommandHandler } from '#application/commands/place-order/place-order.command-handler.ts';
import { GetOrderQueryHandler } from '#application/queries/get-order/get-order.query-handler.ts';
import { createOrderRpcService } from './order.rpc-service.ts';
import { createRpcCorrelation } from './rpc-correlation.adapter.ts';

const generatedCorrelationId = '0199a5d0-0000-7000-8000-0000000000e9';

type PlaceOrderRequestInit = Exclude<
  MessageInitShape<typeof PlaceOrderRequestSchema>,
  PlaceOrderRequest
>;

let unitOfWork: InMemoryUnitOfWork;
let client: Client<typeof OrderService>;
let logEntries: Record<string, unknown>[];

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
    consumerId: '0199a5d0-0000-7000-8000-0000000000c1',
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

beforeEach(() => {
  unitOfWork = new InMemoryUnitOfWork();
  logEntries = [];
  const interceptors = [
    createRpcCorrelation({
      logger: captureLogger(),
      generateCorrelationId: () => generatedCorrelationId,
    }),
  ];
  const transport = createRouterTransport(
    ({ service }) => {
      service(
        OrderService,
        createOrderRpcService({
          placeOrder: new PlaceOrderCommandHandler(
            unitOfWork,
            new FakeClock(),
            new FakeIdGenerator(),
          ),
          getOrder: new GetOrderQueryHandler(unitOfWork.orders),
        }),
      );
    },
    { router: { interceptors } },
  );
  client = createClient(OrderService, transport);
});

describe('OrderService.PlaceOrder', () => {
  it('places an order and returns its id', async () => {
    const response = await client.placeOrder(placeOrderRequest());

    expect(response.orderId).toBe('0199a5d0-0000-7000-8000-0000000000a1');
    expect(unitOfWork.executedMetadata[0]?.correlationId).toBe(generatedCorrelationId);
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
      .placeOrder(placeOrderRequest({ consumerId: 'consumer-1' }), {
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
      consumerId: lowercase.consumerId.toUpperCase(),
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
    { invalidPart: 'a consumer id that is not a uuid', overrides: { consumerId: 'consumer-1' } },
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

  it('rejects a reused key carrying a different request as already existing', async () => {
    await client.placeOrder(placeOrderRequest());

    await expect(
      client.placeOrder(placeOrderRequest({ paymentToken: 'tok_mastercard_4444' })),
    ).rejects.toMatchObject({ code: Code.AlreadyExists });
  });

  it.each<{ readonly reason: string; readonly overrides: PlaceOrderRequestInit }>([
    { reason: 'InvalidPlaceOrderRequest', overrides: { consumerId: 'consumer-1' } },
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
  ])('names the $reason failure in a typed error detail', async ({ reason, overrides }) => {
    const failure = await client
      .placeOrder(placeOrderRequest(overrides))
      .catch((error: unknown) => error);

    expect(ConnectError.from(failure).findDetails(PlaceOrderFailureSchema)).toMatchObject([
      { reason },
    ]);
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
  it('returns a placed order with its status, frozen line items and total', async () => {
    const { orderId } = await client.placeOrder(placeOrderRequest());

    const response = await client.getOrder({ orderId });

    expect(response).toMatchObject({
      orderId,
      status: OrderStatus.APPROVAL_PENDING,
      lineItems: [
        { menuItemId: margheritaId, name: 'Margherita', unitPriceInCents: 4500n, quantity: 2 },
        { menuItemId: guaranaId, name: 'Guarana', unitPriceInCents: 800n, quantity: 1 },
      ],
      totalInCents: 9800n,
      currency: 'BRL',
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
