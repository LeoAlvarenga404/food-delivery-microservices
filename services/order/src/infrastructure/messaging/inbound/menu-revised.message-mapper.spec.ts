import { create, toBinary } from '@bufbuild/protobuf';
import { PermanentMessageFailure, type InboundMessage } from '@fd/chassis-kafka';
import {
  DayOfWeek,
  MenuRevisedSchema,
} from '@fd/contracts/fooddelivery/restaurant/v1/events_pb.js';
import { describe, expect, it } from 'vitest';
import {
  buildMenuRevisedMessage,
  type RestaurantSnapshot,
} from '../../../../test/support/menu-revised-message.builder.ts';
import { toApplyMenuRevisionCommand } from './menu-revised.message-mapper.ts';

const trattoria: RestaurantSnapshot = {
  restaurantId: '0199A5D0-0000-7000-8000-0000000001A1',
  version: 7,
  name: 'Trattoria Roma',
  category: 'Italiana',
  timeZone: 'Europe/Lisbon',
  openingHours: [
    { dayOfWeek: DayOfWeek.SATURDAY, opensAt: '19:00', closesAt: '01:00' },
    { dayOfWeek: DayOfWeek.SUNDAY, opensAt: '12:00', closesAt: '15:30' },
  ],
  minimumOrderInCents: 3500n,
  currency: 'BRL',
  menuItems: [
    {
      menuItemId: '0199a5d0-0000-7000-8000-000000000e02',
      name: 'Lasagna',
      priceInCents: 6100n,
      isAvailable: false,
    },
    {
      menuItemId: '0199A5D0-0000-7000-8000-000000000E01',
      name: 'Tiramisu',
      priceInCents: 2900n,
      isAvailable: true,
    },
  ],
};

function failureOf(message: InboundMessage): unknown {
  try {
    toApplyMenuRevisionCommand(message);
  } catch (error) {
    return error;
  }
  return undefined;
}

describe('toApplyMenuRevisionCommand', () => {
  it('turns a MenuRevised snapshot into the menu replica it carries', () => {
    const message = buildMenuRevisedMessage({ restaurant: trattoria });

    expect(toApplyMenuRevisionCommand(message)).toEqual({
      menu: {
        restaurantId: '0199a5d0-0000-7000-8000-0000000001a1',
        version: 7,
        openingHours: {
          timeZone: 'Europe/Lisbon',
          periods: [
            { dayOfWeek: 'SATURDAY', opensAt: '19:00', closesAt: '01:00' },
            { dayOfWeek: 'SUNDAY', opensAt: '12:00', closesAt: '15:30' },
          ],
        },
        minimumOrderInCents: 3500n,
        items: [
          {
            menuItemId: '0199a5d0-0000-7000-8000-000000000e02',
            name: 'Lasagna',
            priceInCents: 6100n,
            isAvailable: false,
          },
          {
            menuItemId: '0199a5d0-0000-7000-8000-000000000e01',
            name: 'Tiramisu',
            priceInCents: 2900n,
            isAvailable: true,
          },
        ],
      },
    });
  });

  it.each([
    { contractDayOfWeek: DayOfWeek.MONDAY, dayOfWeek: 'MONDAY' },
    { contractDayOfWeek: DayOfWeek.TUESDAY, dayOfWeek: 'TUESDAY' },
    { contractDayOfWeek: DayOfWeek.WEDNESDAY, dayOfWeek: 'WEDNESDAY' },
    { contractDayOfWeek: DayOfWeek.THURSDAY, dayOfWeek: 'THURSDAY' },
    { contractDayOfWeek: DayOfWeek.FRIDAY, dayOfWeek: 'FRIDAY' },
    { contractDayOfWeek: DayOfWeek.SATURDAY, dayOfWeek: 'SATURDAY' },
    { contractDayOfWeek: DayOfWeek.SUNDAY, dayOfWeek: 'SUNDAY' },
  ])('reads the contract day $dayOfWeek', ({ contractDayOfWeek, dayOfWeek }) => {
    const message = buildMenuRevisedMessage({
      restaurant: {
        ...trattoria,
        openingHours: [{ dayOfWeek: contractDayOfWeek, opensAt: '11:00', closesAt: '15:00' }],
      },
    });

    expect(toApplyMenuRevisionCommand(message).menu.openingHours.periods).toEqual([
      { dayOfWeek, opensAt: '11:00', closesAt: '15:00' },
    ]);
  });

  it.each<{ readonly problem: string; readonly message: InboundMessage; readonly reason: string }>([
    {
      problem: 'a message type other than MenuRevised',
      message: buildMenuRevisedMessage(
        { restaurant: trattoria },
        { messageType: 'fooddelivery.restaurant.v1.RestaurantClosed' },
      ),
      reason: 'unknown restaurant state message fooddelivery.restaurant.v1.RestaurantClosed',
    },
    {
      problem: 'a payload that is not a MenuRevised',
      message: {
        ...buildMenuRevisedMessage({ restaurant: trattoria }),
        payload: Uint8Array.of(0xff),
      },
      reason: 'payload is not a valid fooddelivery.restaurant.v1.MenuRevised',
    },
    {
      problem: 'a snapshot without a restaurant',
      message: {
        ...buildMenuRevisedMessage({ restaurant: trattoria }),
        payload: toBinary(MenuRevisedSchema, create(MenuRevisedSchema, {})),
      },
      reason: 'MenuRevised without a restaurant',
    },
    {
      problem: 'a currency other than BRL',
      message: buildMenuRevisedMessage({ restaurant: { ...trattoria, currency: 'USD' } }),
      reason: 'MenuRevised in an unsupported currency',
    },
    {
      problem: 'an unspecified day of the week',
      message: buildMenuRevisedMessage({
        restaurant: {
          ...trattoria,
          openingHours: [{ dayOfWeek: DayOfWeek.UNSPECIFIED, opensAt: '19:00', closesAt: '23:00' }],
        },
      }),
      reason: 'MenuRevised refused: InvalidOpeningHours dayOfWeek',
    },
    {
      problem: 'an unknown time zone',
      message: buildMenuRevisedMessage({ restaurant: { ...trattoria, timeZone: 'Mars/Olympus' } }),
      reason: 'MenuRevised refused: InvalidOpeningHours timeZone',
    },
    {
      problem: 'a menu item name with a control character',
      message: buildMenuRevisedMessage({
        restaurant: {
          ...trattoria,
          menuItems: [
            {
              menuItemId: '0199a5d0-0000-7000-8000-000000000e01',
              name: 'Tira\u001bmisu',
              priceInCents: 2900n,
              isAvailable: true,
            },
          ],
        },
      }),
      reason: 'MenuRevised refused: InvalidRestaurantMenu name',
    },
  ])('dead-letters $problem, naming the reason', ({ message, reason }) => {
    expect(failureOf(message)).toEqual(new PermanentMessageFailure(reason));
  });
});
