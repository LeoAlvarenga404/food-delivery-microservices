import { beforeAll, describe, expect, it } from 'vitest';
import { DockerComposeStack } from './support/docker-compose-stack.adapter.ts';
import {
  HttpRestaurantApi,
  pizzeriaMenu,
  pizzeriaOnboarding,
} from './support/http-restaurant-api.adapter.ts';

const restaurantStateTopic = 'restaurant.restaurant.state';
const staffAApi = new HttpRestaurantApi('staff-a');
const staffBApi = new HttpRestaurantApi('staff-b');
const stack = new DockerComposeStack();

beforeAll(() => staffAApi.waitUntilReachable());

describe('restaurant onboarding and menu revision', () => {
  it('lets staff onboard a restaurant, revise its menu and read it back at the new version', async () => {
    const onboarded = await staffAApi.onboardRestaurant(pizzeriaOnboarding);
    const restaurantId = await staffAApi.readRestaurantId(onboarded);

    const revised = await staffAApi.reviseMenu(restaurantId, pizzeriaMenu);

    expect(onboarded.status).toBe(201);
    expect(onboarded.headers.get('location')).toBe(`/v1/restaurant/restaurants/${restaurantId}`);
    expect(revised.status).toBe(200);
    expect(await revised.json()).toEqual({ version: 2 });
    const restaurant = await staffAApi.fetchRestaurant(restaurantId);
    expect(await restaurant.json()).toMatchObject({
      restaurantId,
      version: 2,
      ...pizzeriaOnboarding,
      currency: 'BRL',
      menuItems: pizzeriaMenu,
    });
    expect(await staffAApi.readMemberships()).toContainEqual({
      restaurantId,
      restaurantName: 'Pizzaria Bella',
      role: 'OWNER',
    });
  });

  it('publishes both snapshots to the compacted state topic keyed by the restaurant id', async () => {
    const restaurantId = await staffAApi.onboardPizzeria();
    await staffAApi.reviseMenu(restaurantId, pizzeriaMenu);

    const messageTypesByKey = await stack.readMessageTypesByKey(restaurantStateTopic);

    expect(messageTypesByKey.get(restaurantId)).toEqual([
      'fooddelivery.restaurant.v1.MenuRevised',
      'fooddelivery.restaurant.v1.MenuRevised',
    ]);
    expect(await stack.describeTopicConfiguration(restaurantStateTopic)).toMatch(
      /cleanup\.policy=compact\s/,
    );
  });

  it('refuses another staff member the restaurant of staff a and leaves its menu as it was', async () => {
    const restaurantId = await staffAApi.onboardPizzeria();

    const read = await staffBApi.fetchRestaurant(restaurantId);
    const revised = await staffBApi.reviseMenu(restaurantId, pizzeriaMenu);

    expect(read.status).toBe(403);
    expect(revised.status).toBe(403);
    expect(await revised.json()).toEqual({
      type: 'about:blank',
      title: 'Forbidden',
      status: 403,
      reason: 'NotRestaurantMember',
    });
    expect(await (await staffAApi.fetchRestaurant(restaurantId)).json()).toMatchObject({
      version: 1,
      menuItems: [],
    });
  });

  it('forbids a consumer from the restaurant routes', async () => {
    const response = await new HttpRestaurantApi('consumer-a').fetchMemberships();

    expect(response.status).toBe(403);
  });

  it('refuses a restaurant request without a token at the edge', async () => {
    const response = await new HttpRestaurantApi(undefined).fetchMemberships();

    expect(response.status).toBe(401);
    expect(response.headers.get('content-type')).toBe('application/problem+json');
    expect(response.headers.get('x-correlation-id')).toBeNull();
  });
});
