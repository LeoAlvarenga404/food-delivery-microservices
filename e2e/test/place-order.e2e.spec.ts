import { randomUUID } from 'node:crypto';
import { beforeAll, describe, expect, it } from 'vitest';
import {
  HttpConsumerApi,
  openPizzeria,
  type PizzeriaOrder,
} from './support/http-consumer-api.adapter.ts';

const consumerApi = new HttpConsumerApi('consumer-a');
const minimumSlowCardExtraDelayInMilliseconds = 6_000;
let pizzeriaOrder: PizzeriaOrder;

function placementHeaders(idempotencyKey: string): Record<string, string> {
  return { 'idempotency-key': idempotencyKey };
}

async function measureApprovalInMilliseconds(paymentToken: string): Promise<number> {
  const placedAtInMilliseconds = Date.now();
  const response = await consumerApi.placeOrder(
    { ...pizzeriaOrder, paymentToken },
    placementHeaders(randomUUID()),
  );
  const orderId = await consumerApi.readPlacedOrderId(response);
  await consumerApi.waitForOrderStatus(orderId, 'APPROVED');
  return Date.now() - placedAtInMilliseconds;
}

beforeAll(async () => {
  await consumerApi.waitUntilReachableAndRegistered();
  pizzeriaOrder = await openPizzeria();
});

describe('placing an order through the edge', () => {
  it('approves the order once every participant answered the saga, charging the delivery fee', async () => {
    const response = await consumerApi.placeOrder(pizzeriaOrder, placementHeaders(randomUUID()));

    expect(response.status).toBe(201);
    const orderId = await consumerApi.readPlacedOrderId(response);
    await expect(consumerApi.waitForOrderStatus(orderId, 'APPROVED')).resolves.toEqual({
      orderId,
      status: 'APPROVED',
      deliveryFeeInCents: '800',
      totalInCents: '10600',
      currency: 'BRL',
    });
  });

  it('approves an order paid with the slow test card later than one paid with a normal card', async () => {
    const normalApprovalInMilliseconds = await measureApprovalInMilliseconds('tok_visa_4242');
    const slowApprovalInMilliseconds = await measureApprovalInMilliseconds('tok_visa_0009');

    expect(slowApprovalInMilliseconds - normalApprovalInMilliseconds).toBeGreaterThanOrEqual(
      minimumSlowCardExtraDelayInMilliseconds,
    );
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
    const response = await consumerApi.placeOrder(pizzeriaOrder, {});

    expect(response.status).toBe(400);
    expect(response.headers.get('content-type')).toBe('application/problem+json');
    expect(response.headers.get('x-correlation-id')).toBeNull();
  });
});
