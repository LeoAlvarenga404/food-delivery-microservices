import { create } from '@bufbuild/protobuf';
import { DayOfWeek, MenuItemSchema } from '@fd/contracts/fooddelivery/restaurant/v1/events_pb.js';
import { OnboardRestaurantRequestSchema } from '@fd/contracts/fooddelivery/restaurant/v1/service_pb.js';
import { describe, expect, it } from 'vitest';
import { toRawMenuItems, toRawRestaurantProfile } from './restaurant-request.message-mapper.ts';

const everyDay = [
  { contractDay: DayOfWeek.MONDAY, dayName: 'MONDAY' },
  { contractDay: DayOfWeek.TUESDAY, dayName: 'TUESDAY' },
  { contractDay: DayOfWeek.WEDNESDAY, dayName: 'WEDNESDAY' },
  { contractDay: DayOfWeek.THURSDAY, dayName: 'THURSDAY' },
  { contractDay: DayOfWeek.FRIDAY, dayName: 'FRIDAY' },
  { contractDay: DayOfWeek.SATURDAY, dayName: 'SATURDAY' },
  { contractDay: DayOfWeek.SUNDAY, dayName: 'SUNDAY' },
];
const paulista = {
  street: 'Avenida Paulista',
  number: '1000',
  city: 'Sao Paulo',
  postalCode: '01310-100',
  location: { latitude: -23.5614, longitude: -46.6559 },
};
const missingLocation = { latitude: Number.NaN, longitude: Number.NaN };

function openingAt(hour: number): string {
  return `${String(hour).padStart(2, '0')}:00`;
}

describe('toRawRestaurantProfile', () => {
  it('maps every field of an onboarding request and every day by its name', () => {
    const request = create(OnboardRestaurantRequestSchema, {
      name: 'Pizzaria Bella',
      category: 'Pizza',
      address: paulista,
      timeZone: 'America/Sao_Paulo',
      openingHours: everyDay.map(({ contractDay }, index) => ({
        dayOfWeek: contractDay,
        opensAt: openingAt(index),
        closesAt: '23:30',
      })),
      minimumOrderInCents: 2000n,
    });

    expect(toRawRestaurantProfile(request)).toEqual({
      name: 'Pizzaria Bella',
      category: 'Pizza',
      address: paulista,
      timeZone: 'America/Sao_Paulo',
      openingHours: everyDay.map(({ dayName }, index) => ({
        dayOfWeek: dayName,
        opensAt: openingAt(index),
        closesAt: '23:30',
      })),
      minimumOrderInCents: 2000n,
    });
  });

  it('maps an unspecified day to a name the domain refuses', () => {
    const request = create(OnboardRestaurantRequestSchema, {
      openingHours: [{ dayOfWeek: DayOfWeek.UNSPECIFIED, opensAt: '18:00', closesAt: '23:30' }],
    });

    expect(toRawRestaurantProfile(request).openingHours).toEqual([
      { dayOfWeek: 'UNSPECIFIED', opensAt: '18:00', closesAt: '23:30' },
    ]);
  });

  it.each([
    {
      absentPart: 'address',
      address: undefined,
      rawAddress: { street: '', number: '', city: '', postalCode: '', location: missingLocation },
    },
    {
      absentPart: 'location',
      address: { ...paulista, location: undefined },
      rawAddress: { ...paulista, location: missingLocation },
    },
  ])('maps an absent $absentPart to values the domain refuses', ({ address, rawAddress }) => {
    const request = create(OnboardRestaurantRequestSchema, { address });

    expect(toRawRestaurantProfile(request).address).toEqual(rawAddress);
  });
});

describe('toRawMenuItems', () => {
  it('maps every field of each menu item in its order', () => {
    const menuItems = [
      {
        menuItemId: '0199a5d0-0000-7000-8000-000000000d02',
        name: 'Guarana',
        priceInCents: 800n,
        isAvailable: false,
      },
      {
        menuItemId: '0199a5d0-0000-7000-8000-000000000d01',
        name: 'Margherita',
        priceInCents: 4500n,
        isAvailable: true,
      },
    ];

    expect(toRawMenuItems(menuItems.map((menuItem) => create(MenuItemSchema, menuItem)))).toEqual(
      menuItems,
    );
  });
});
