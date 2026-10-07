import { randomUUID } from 'node:crypto';
import { beforeAll, describe, expect, it } from 'vitest';
import {
  HttpConsumerApi,
  openPizzeria,
  type PizzeriaOrder,
} from './support/http-consumer-api.adapter.ts';
import { KeycloakSignIn } from './support/keycloak-sign-in.adapter.ts';

const consumerAApi = new HttpConsumerApi('consumer-a');
const consumerBApi = new HttpConsumerApi('consumer-b');
const anonymousApi = new HttpConsumerApi(undefined);
let pizzeriaOrder: PizzeriaOrder;

function withAnotherSignature(accessToken: string): string {
  const [header, payload, signature = ''] = accessToken.split('.');
  return [header, payload, `${signature.startsWith('A') ? 'B' : 'A'}${signature.slice(1)}`].join(
    '.',
  );
}

beforeAll(async () => {
  await consumerAApi.waitUntilReachableAndRegistered();
  pizzeriaOrder = await openPizzeria();
});

describe('authorization of order requests', () => {
  it('refuses a placement without a token at the edge with an unauthorized problem', async () => {
    const response = await anonymousApi.placeOrder(pizzeriaOrder, {
      'idempotency-key': randomUUID(),
    });

    expect(response.status).toBe(401);
    expect(response.headers.get('content-type')).toBe('application/problem+json');
    expect(await response.json()).toEqual({
      type: 'about:blank',
      title: 'Unauthorized',
      status: 401,
    });
  });

  it('refuses a token whose signature was changed at the edge', async () => {
    const accessToken = await new KeycloakSignIn('consumer-a').accessToken();

    const response = await anonymousApi.placeOrder(pizzeriaOrder, {
      'idempotency-key': randomUUID(),
      authorization: `Bearer ${withAnotherSignature(accessToken)}`,
    });

    expect(response.status).toBe(401);
    expect(response.headers.get('x-correlation-id')).toBeNull();
  });

  it('forbids restaurant staff from placing orders', async () => {
    const staffApi = new HttpConsumerApi('staff-a');

    const response = await staffApi.placeOrder(pizzeriaOrder, { 'idempotency-key': randomUUID() });

    expect(response.status).toBe(403);
    expect(await response.json()).toEqual({ type: 'about:blank', title: 'Forbidden', status: 403 });
  });

  it('answers the order of another consumer as not found', async () => {
    const placed = await consumerAApi.placeOrder(pizzeriaOrder, {
      'idempotency-key': randomUUID(),
    });
    const orderId = await consumerAApi.readPlacedOrderId(placed);

    const response = await consumerBApi.fetchOrder(orderId);

    expect(response.status).toBe(404);
    expect((await consumerAApi.fetchOrder(orderId)).status).toBe(200);
  });

  it('creates one order per consumer when two consumers send the same Idempotency-Key', async () => {
    const headers = { 'idempotency-key': randomUUID() };

    const forConsumerA = await consumerAApi.placeOrder(pizzeriaOrder, headers);
    const forConsumerB = await consumerBApi.placeOrder(pizzeriaOrder, headers);

    expect([forConsumerA.status, forConsumerB.status]).toEqual([201, 201]);
    const consumerAOrderId = await consumerAApi.readPlacedOrderId(forConsumerA);
    const consumerBOrderId = await consumerBApi.readPlacedOrderId(forConsumerB);
    expect(consumerBOrderId).not.toBe(consumerAOrderId);
    await expect(
      consumerAApi.waitForOrderStatus(consumerAOrderId, 'APPROVED'),
    ).resolves.toMatchObject({ status: 'APPROVED' });
  });
});
