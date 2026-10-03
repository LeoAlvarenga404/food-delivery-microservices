import { randomUUID } from 'node:crypto';
import { beforeAll, describe, expect, it } from 'vitest';
import {
  HttpConsumerApi,
  pizzeriaOrder,
  walkingSkeletonConsumerId,
} from './support/http-consumer-api.adapter.ts';

const consumerApi = new HttpConsumerApi();
const simulatedGatewayDelayInMilliseconds = 3_000;

function placementHeaders(idempotencyKey: string): Record<string, string> {
  return { 'idempotency-key': idempotencyKey, 'x-consumer-id': walkingSkeletonConsumerId };
}

beforeAll(() => consumerApi.waitUntilReachable());

describe('placing an order through the edge', () => {
  it('approves the order once every participant answered the saga', async () => {
    const response = await consumerApi.placeOrder(pizzeriaOrder, placementHeaders(randomUUID()));

    expect(response.status).toBe(201);
    const orderId = await consumerApi.readPlacedOrderId(response);
    await expect(consumerApi.waitForOrderStatus(orderId, 'APPROVED')).resolves.toEqual({
      orderId,
      status: 'APPROVED',
      totalInCents: '9800',
      currency: 'BRL',
    });
  });

  it('approves an order paid with the slow test card only after the gateway delay', async () => {
    const placedAt = Date.now();
    const response = await consumerApi.placeOrder(
      { ...pizzeriaOrder, paymentToken: 'tok_visa_0009' },
      placementHeaders(randomUUID()),
    );

    const orderId = await consumerApi.readPlacedOrderId(response);
    await consumerApi.waitForOrderStatus(orderId, 'APPROVED');
    expect(Date.now() - placedAt).toBeGreaterThanOrEqual(simulatedGatewayDelayInMilliseconds);
  });

  it('answers a repeated placement with the same Idempotency-Key with the same order', async () => {
    const headers = placementHeaders(randomUUID());
    const first = await consumerApi.placeOrder(pizzeriaOrder, headers);
    const repeated = await consumerApi.placeOrder(pizzeriaOrder, headers);

    expect(repeated.status).toBe(201);
    expect(await consumerApi.readPlacedOrderId(repeated)).toBe(
      await consumerApi.readPlacedOrderId(first),
    );
  });

  it('refuses the same Idempotency-Key carrying a different order', async () => {
    const headers = placementHeaders(randomUUID());
    await consumerApi.placeOrder(pizzeriaOrder, headers);

    const response = await consumerApi.placeOrder(
      { ...pizzeriaOrder, paymentToken: 'tok_mastercard_4444' },
      headers,
    );

    expect(response.status).toBe(422);
    expect(await response.json()).toMatchObject({ status: 422, reason: 'IdempotencyKeyReused' });
  });

  it('rejects a placement without Idempotency-Key at the edge before the BFF', async () => {
    const response = await consumerApi.placeOrder(pizzeriaOrder, {
      'x-consumer-id': walkingSkeletonConsumerId,
    });

    expect(response.status).toBe(400);
    expect(response.headers.get('content-type')).toBe('application/problem+json');
    expect(response.headers.get('x-correlation-id')).toBeNull();
  });
});
