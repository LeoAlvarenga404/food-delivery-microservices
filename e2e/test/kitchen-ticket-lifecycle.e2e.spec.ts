import { randomUUID } from 'node:crypto';
import { beforeAll, describe, expect, it } from 'vitest';
import {
  HttpConsumerApi,
  openPizzeria,
  type PizzeriaOrder,
} from './support/http-consumer-api.adapter.ts';
import { HttpKitchenApi, type KitchenTicket } from './support/http-kitchen-api.adapter.ts';
import { DockerComposeStack } from './support/docker-compose-stack.adapter.ts';

const consumerApi = new HttpConsumerApi('consumer-a');
const staffAKitchen = new HttpKitchenApi('staff-a');
const staffBKitchen = new HttpKitchenApi('staff-b');
const consumerKitchen = new HttpKitchenApi('consumer-a');
const stack = new DockerComposeStack();
const twoMinutesInMilliseconds = 120_000;
let pizzeriaOrder: PizzeriaOrder;

async function placeApprovedOrder(): Promise<string> {
  const response = await consumerApi.placeOrder(pizzeriaOrder, {
    'idempotency-key': randomUUID(),
  });
  const orderId = await consumerApi.readPlacedOrderId(response);
  await consumerApi.waitForOrderStatus(orderId, 'APPROVED');
  return orderId;
}

beforeAll(async () => {
  await consumerApi.waitUntilReachableAndRegistered();
  pizzeriaOrder = await openPizzeria();
});

describe('the kitchen of a restaurant', () => {
  it('takes an approved order from acceptance to ready for pickup and publishes each step', async () => {
    const orderId = await placeApprovedOrder();
    const { restaurantId } = pizzeriaOrder;
    const listed = await staffAKitchen.waitForTicket(restaurantId, orderId);
    const address = { restaurantId, ticketId: listed.ticketId };

    const accepted = await staffAKitchen.advanceTicket(address, 'acceptance', {
      preparationTimeInMinutes: 2,
    });
    const answeredAtInMilliseconds = Date.parse(accepted.headers.get('date') ?? '');
    const acceptedTicket: KitchenTicket = await staffAKitchen.readTicket(accepted);
    const acceptedAgain = await staffAKitchen.advanceTicket(address, 'acceptance', {
      preparationTimeInMinutes: 2,
    });
    const preparing = await staffAKitchen.advanceTicket(address, 'preparation');
    const ready = await staffAKitchen.advanceTicket(address, 'readiness');

    expect(listed.status).toBe('AWAITING_ACCEPTANCE');
    expect([accepted.status, acceptedTicket.status]).toEqual([200, 'ACCEPTED']);
    const readyBy = Date.parse(acceptedTicket.readyBy ?? '');
    expect(readyBy - answeredAtInMilliseconds).toBeGreaterThan(twoMinutesInMilliseconds - 5_000);
    expect(readyBy - answeredAtInMilliseconds).toBeLessThanOrEqual(
      twoMinutesInMilliseconds + 5_000,
    );
    expect(acceptedAgain.status).toBe(422);
    expect(await acceptedAgain.json()).toMatchObject({ reason: 'InvalidTicketTransition' });
    expect((await staffAKitchen.readTicket(preparing)).status).toBe('PREPARING');
    expect((await staffAKitchen.readTicket(ready)).status).toBe('READY_FOR_PICKUP');
    await expect
      .poll(
        async () =>
          (await stack.readMessageTypesByKey('kitchen.ticket.events')).get(listed.ticketId),
        {
          timeout: 60_000,
        },
      )
      .toEqual([
        'fooddelivery.kitchen.v1.TicketAccepted',
        'fooddelivery.kitchen.v1.TicketPreparationStarted',
        'fooddelivery.kitchen.v1.TicketReadyForPickup',
      ]);
  });

  it('refuses a staff member of another restaurant and a consumer with 403', async () => {
    const orderId = await placeApprovedOrder();
    const { restaurantId } = pizzeriaOrder;
    const listed = await staffAKitchen.waitForTicket(restaurantId, orderId);

    const staffBList = await staffBKitchen.fetchTickets(restaurantId);
    const staffBAcceptance = await staffBKitchen.advanceTicket(
      { restaurantId, ticketId: listed.ticketId },
      'acceptance',
      { preparationTimeInMinutes: 10 },
    );
    const consumerList = await consumerKitchen.fetchTickets(restaurantId);

    expect([staffBList.status, staffBAcceptance.status, consumerList.status]).toEqual([
      403, 403, 403,
    ]);
    expect(await staffBList.json()).toMatchObject({ reason: 'NotRestaurantMember' });
    expect(await staffBAcceptance.json()).toMatchObject({ reason: 'NotRestaurantMember' });
    expect(await consumerList.json()).toEqual({
      type: 'about:blank',
      title: 'Forbidden',
      status: 403,
    });
    const stillListed = await staffAKitchen.waitForTicket(restaurantId, orderId);
    expect(stillListed.status).toBe('AWAITING_ACCEPTANCE');
  });
});
