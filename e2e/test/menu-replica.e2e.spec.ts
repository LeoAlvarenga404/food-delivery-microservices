import { randomUUID } from 'node:crypto';
import { beforeAll, describe, expect, it } from 'vitest';
import {
  guaranaId,
  HttpConsumerApi,
  openPizzeria,
  pizzeriaOrderAt,
  type PizzeriaOrder,
} from './support/http-consumer-api.adapter.ts';
import { HttpRestaurantApi, orderablePizzeriaMenu } from './support/http-restaurant-api.adapter.ts';

const consumerApi = new HttpConsumerApi('consumer-a');
const staffAApi = new HttpRestaurantApi('staff-a');
const aguaId = '0199a5d0-0000-7000-8000-000000000104';
const daysOfWeekFromSunday = [
  'SUNDAY',
  'MONDAY',
  'TUESDAY',
  'WEDNESDAY',
  'THURSDAY',
  'FRIDAY',
  'SATURDAY',
];
const threeDaysInMilliseconds = 259_200_000;

async function approvedTotalInCents(order: PizzeriaOrder): Promise<string> {
  const response = await consumerApi.placeOrder(order, { 'idempotency-key': randomUUID() });
  const orderId = await consumerApi.readPlacedOrderId(response);
  return (await consumerApi.waitForOrderStatus(orderId, 'APPROVED')).totalInCents;
}

function unprocessableProblem(reason: string): object {
  return { type: 'about:blank', title: 'Unprocessable Entity', status: 422, reason };
}

beforeAll(() => consumerApi.waitUntilReachableAndRegistered());

describe('placing orders against the menu replica in Order', () => {
  it('prices the next order with the menu the restaurant revised', async () => {
    const pizzeriaOrder = await openPizzeria();
    const totalBeforeRevision = await approvedTotalInCents(pizzeriaOrder);

    const revised = await staffAApi.reviseMenu(pizzeriaOrder.restaurantId, [
      ...orderablePizzeriaMenu.map((item) =>
        item.name === 'Margherita' ? { ...item, priceInCents: '5000' } : item,
      ),
      { menuItemId: aguaId, name: 'Agua', priceInCents: '500', isAvailable: true },
    ]);
    expect(revised.status).toBe(200);
    await consumerApi.waitForPlacementRefusal(
      { ...pizzeriaOrder, lineItems: [{ menuItemId: aguaId, quantity: 1 }] },
      'MinimumOrderNotReached',
    );

    expect([totalBeforeRevision, await approvedTotalInCents(pizzeriaOrder)]).toEqual([
      '9800',
      '10800',
    ]);
  });

  it('refuses an order while the restaurant is closed with an unprocessable entity problem', async () => {
    const dayOfWeek =
      daysOfWeekFromSunday[new Date(Date.now() + threeDaysInMilliseconds).getUTCDay()];
    const restaurantId = await staffAApi.openPizzeria([
      { dayOfWeek, opensAt: '10:00', closesAt: '11:00' },
    ]);

    const problem = await consumerApi.waitForPlacementRefusal(
      pizzeriaOrderAt(restaurantId),
      'RestaurantClosed',
    );

    expect(problem).toEqual(unprocessableProblem('RestaurantClosed'));
  });

  it('refuses an order below the minimum order and approves one whose quantity reaches it', async () => {
    const pizzeriaOrder = await openPizzeria();

    const response = await consumerApi.placeOrder(
      { ...pizzeriaOrder, lineItems: [{ menuItemId: guaranaId, quantity: 2 }] },
      { 'idempotency-key': randomUUID() },
    );

    expect(response.status).toBe(422);
    expect(await response.json()).toEqual(unprocessableProblem('MinimumOrderNotReached'));
    expect(
      await approvedTotalInCents({
        ...pizzeriaOrder,
        lineItems: [{ menuItemId: guaranaId, quantity: 3 }],
      }),
    ).toBe('2400');
  });
});
