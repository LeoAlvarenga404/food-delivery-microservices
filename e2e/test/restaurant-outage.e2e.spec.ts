import { randomBytes, randomUUID } from 'node:crypto';
import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import { DockerComposeStack } from './support/docker-compose-stack.adapter.ts';
import { HttpCatalogueApi } from './support/http-catalogue-api.adapter.ts';
import {
  HttpConsumerApi,
  openPizzeria,
  type PizzeriaOrder,
} from './support/http-consumer-api.adapter.ts';
import { HttpRestaurantApi, orderablePizzeriaMenu } from './support/http-restaurant-api.adapter.ts';

const edgeUrl = process.env['E2E_EDGE_URL'] ?? 'http://127.0.0.1:8080';
const consumerApi = new HttpConsumerApi('consumer-a');
const staffAApi = new HttpRestaurantApi('staff-a');
const catalogue = new HttpCatalogueApi();
const stack = new DockerComposeStack();
const letters = 'abcdefghijklmnopqrstuvwxyz';
const catchUpLimitInMilliseconds = 120_000;
let pizzeriaOrder: PizzeriaOrder;

function randomLetters(count: number): string {
  return Array.from(randomBytes(count), (byte) => letters.charAt(byte % letters.length)).join('');
}

async function placeApprovedOrder(): Promise<void> {
  const response = await consumerApi.placeOrder(pizzeriaOrder, { 'idempotency-key': randomUUID() });
  expect(response.status).toBe(201);
  const orderId = await consumerApi.readPlacedOrderId(response);
  await expect(consumerApi.waitForOrderStatus(orderId, 'APPROVED')).resolves.toMatchObject({
    status: 'APPROVED',
    totalInCents: '10600',
  });
}

beforeAll(async () => {
  await consumerApi.waitUntilReachableAndRegistered();
  pizzeriaOrder = await openPizzeria();
});

afterEach(async () => {
  await stack.startService('opensearch');
  await stack.startService('restaurant-service');
});

describe('orders while a restaurant dependency is down', () => {
  it('approves orders without OpenSearch and indexes a menu revised meanwhile once it is back', async () => {
    await stack.stopService('opensearch');
    const dishWord = randomLetters(10);

    await placeApprovedOrder();
    const search = await fetch(`${edgeUrl}/v1/restaurants?text=${dishWord}`);
    expect([503, 504]).toContain(search.status);
    const revised = await staffAApi.reviseMenu(pizzeriaOrder.restaurantId, [
      ...orderablePizzeriaMenu,
      { ...orderablePizzeriaMenu[0], menuItemId: randomUUID(), name: `Torta ${dishWord}` },
    ]);
    expect(revised.status).toBe(200);
    await stack.startService('opensearch');

    await expect(
      catalogue.waitForHit(dishWord, pizzeriaOrder.restaurantId, catchUpLimitInMilliseconds),
    ).resolves.toMatchObject({ restaurantId: pizzeriaOrder.restaurantId });
  });

  it('places orders from the menu replica while Restaurant is down', async () => {
    await stack.stopService('restaurant-service');

    const memberships = await staffAApi.fetchMemberships();
    expect(memberships.status).toBe(503);
    await placeApprovedOrder();
  });
});
