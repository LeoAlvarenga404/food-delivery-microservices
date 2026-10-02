import { create, type MessageInitShape } from '@bufbuild/protobuf';
import { Code, createClient, createRouterTransport, type Client } from '@connectrpc/connect';
import {
  OrderService,
  OrderStatus,
  PlaceOrderRequestSchema,
  type PlaceOrderRequest,
} from '@fd/contracts/fooddelivery/order/v1/service_pb.js';
import { beforeEach, describe, expect, it } from 'vitest';
import { FakeClock } from '../../../test/support/clock.fake.ts';
import { FakeIdGenerator } from '../../../test/support/id-generator.fake.ts';
import { InMemoryUnitOfWork } from '../../../test/support/in-memory-unit-of-work.adapter.ts';
import { guaranaId, margheritaId, pizzeriaMenu } from '../../../test/support/order.builder.ts';
import { PlaceOrderCommandHandler } from '#application/commands/place-order/place-order.command-handler.ts';
import { GetOrderQueryHandler } from '#application/queries/get-order/get-order.query-handler.ts';
import { createOrderRpcService } from './order.rpc-service.ts';

const generatedCorrelationId = '0199a5d0-0000-7000-8000-0000000000e9';

type PlaceOrderRequestInit = Exclude<
  MessageInitShape<typeof PlaceOrderRequestSchema>,
  PlaceOrderRequest
>;

let unitOfWork: InMemoryUnitOfWork;
let client: Client<typeof OrderService>;

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
  const transport = createRouterTransport(({ service }) => {
    service(
      OrderService,
      createOrderRpcService({
        placeOrder: new PlaceOrderCommandHandler(
          unitOfWork,
          new FakeClock(),
          new FakeIdGenerator(),
        ),
        getOrder: new GetOrderQueryHandler(unitOfWork.orders),
        generateCorrelationId: () => generatedCorrelationId,
      }),
    );
  });
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

  it('answers a retried request with the same order', async () => {
    const first = await client.placeOrder(placeOrderRequest());
    const retried = await client.placeOrder(placeOrderRequest());

    expect(retried.orderId).toBe(first.orderId);
    expect(unitOfWork.orders.rows.size).toBe(1);
  });

  it.each<{ readonly invalidPart: string; readonly overrides: PlaceOrderRequestInit }>([
    { invalidPart: 'a blank idempotency key', overrides: { idempotencyKey: ' ' } },
    { invalidPart: 'a consumer id that is not a uuid', overrides: { consumerId: 'consumer-1' } },
    {
      invalidPart: 'a menu item id that is not a uuid',
      overrides: { lineItems: [{ menuItemId: 'margherita', quantity: 1 }] },
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

  it('rejects a reused key carrying a different request as already existing', async () => {
    await client.placeOrder(placeOrderRequest());

    await expect(
      client.placeOrder(placeOrderRequest({ paymentToken: 'tok_mastercard_4444' })),
    ).rejects.toMatchObject({ code: Code.AlreadyExists });
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
