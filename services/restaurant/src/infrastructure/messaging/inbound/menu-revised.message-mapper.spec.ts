import { PermanentMessageFailure } from '@fd/chassis-kafka';
import { create } from '@bufbuild/protobuf';
import {
  DayOfWeek,
  MenuItemSchema,
  OpeningPeriodSchema,
} from '@fd/contracts/fooddelivery/restaurant/v1/events_pb.js';
import { describe, expect, it } from 'vitest';
import {
  buildMenuRevisedMessage,
  menuRevisedOf,
} from '../../../../test/support/menu-revised-message.builder.ts';
import { buildSearchableRestaurant } from '../../../../test/support/searchable-restaurant.builder.ts';
import { toProjectRestaurantCommand } from './menu-revised.message-mapper.ts';

const cantina = buildSearchableRestaurant({
  restaurantId: '0199a5d0-0000-7000-8000-0000000000c7',
  version: 7,
  name: 'Cantina Nonna',
  category: 'Italiana',
  location: { latitude: -23.5505, longitude: -46.6333 },
  timeZone: 'America/Manaus',
  openingHours: [
    { dayOfWeek: 'TUESDAY', opensAt: '11:30', closesAt: '15:00' },
    { dayOfWeek: 'WEDNESDAY', opensAt: '19:00', closesAt: '01:00' },
  ],
  menuItems: [
    {
      menuItemId: '0199a5d0-0000-7000-8000-000000000d07',
      name: 'Lasanha',
      priceInCents: 5200n,
      isAvailable: true,
    },
    {
      menuItemId: '0199a5d0-0000-7000-8000-000000000d08',
      name: 'Tiramisu',
      priceInCents: 2100n,
      isAvailable: false,
    },
  ],
});
const cantinaContract = menuRevisedOf(cantina).restaurant;

function refusalOf(action: () => unknown): string {
  try {
    action();
  } catch (error) {
    if (error instanceof PermanentMessageFailure) return error.message;
    throw error;
  }
  throw new Error('expected a permanent message failure');
}

describe('toProjectRestaurantCommand', () => {
  it('turns a MenuRevised snapshot into the restaurant it projects, field by field', () => {
    const message = buildMenuRevisedMessage(menuRevisedOf(cantina));

    expect(toProjectRestaurantCommand(message)).toEqual({ restaurant: cantina });
  });

  it.each([
    {
      reason: 'an unknown message type',
      message: buildMenuRevisedMessage(menuRevisedOf(cantina), {
        messageType: 'fooddelivery.restaurant.v1.RestaurantClosed',
      }),
      refusal: 'unknown restaurant state message fooddelivery.restaurant.v1.RestaurantClosed',
    },
    {
      reason: 'an undecodable payload',
      message: {
        ...buildMenuRevisedMessage(menuRevisedOf(cantina)),
        payload: new Uint8Array([0xff, 0xff, 0xff]),
      },
      refusal: 'payload is not a valid fooddelivery.restaurant.v1.MenuRevised',
    },
    {
      reason: 'a snapshot without a restaurant',
      message: buildMenuRevisedMessage({}),
      refusal: 'MenuRevised without a restaurant',
    },
    {
      reason: 'a currency other than BRL',
      message: buildMenuRevisedMessage({ restaurant: { ...cantinaContract, currency: 'EUR' } }),
      refusal: 'MenuRevised in an unsupported currency',
    },
    {
      reason: 'an invalid restaurant id',
      message: buildMenuRevisedMessage({
        restaurant: { ...cantinaContract, restaurantId: 'not-a-uuid' },
      }),
      refusal: 'MenuRevised refused: InvalidRestaurantId',
    },
    {
      reason: 'a version below one',
      message: buildMenuRevisedMessage({ restaurant: { ...cantinaContract, version: 0 } }),
      refusal: 'MenuRevised refused: InvalidVersion',
    },
    {
      reason: 'a blank name',
      message: buildMenuRevisedMessage({ restaurant: { ...cantinaContract, name: ' ' } }),
      refusal: 'MenuRevised refused: InvalidRestaurantName',
    },
    {
      reason: 'an opening period without a day',
      message: buildMenuRevisedMessage({
        restaurant: {
          ...cantinaContract,
          openingHours: [
            create(OpeningPeriodSchema, {
              dayOfWeek: DayOfWeek.UNSPECIFIED,
              opensAt: '11:30',
              closesAt: '15:00',
            }),
          ],
        },
      }),
      refusal: 'MenuRevised refused: InvalidOpeningPeriod',
    },
    {
      reason: 'a menu item name with a control character',
      message: buildMenuRevisedMessage({
        restaurant: {
          ...cantinaContract,
          menuItems: [
            create(MenuItemSchema, {
              menuItemId: '0199a5d0-0000-7000-8000-000000000d07',
              name: 'Lasa\u0007nha',
              priceInCents: 5200n,
              isAvailable: true,
            }),
          ],
        },
      }),
      refusal: 'MenuRevised refused: InvalidMenuItem',
    },
  ])('dead-letters $reason, naming the reason', ({ message, refusal }) => {
    expect(refusalOf(() => toProjectRestaurantCommand(message))).toBe(refusal);
  });
});
