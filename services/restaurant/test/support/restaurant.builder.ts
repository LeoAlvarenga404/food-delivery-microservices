import type { Either } from '@fd/domain';
import type { MenuItem, RawMenuItem } from '#domain/restaurant/menu-item.value-object.ts';
import { parseMenu, type Menu } from '#domain/restaurant/menu.value-object.ts';
import {
  parseRestaurantId,
  type RestaurantId,
} from '#domain/restaurant/restaurant-id.value-object.ts';
import {
  parseRestaurantProfile,
  type RawRestaurantProfile,
} from '#domain/restaurant/restaurant-profile.value-object.ts';
import {
  Restaurant,
  type OnboardRestaurantInput,
  type RestaurantSnapshot,
} from '#domain/restaurant/restaurant.aggregate.ts';
import {
  parseStaffMemberId,
  type StaffMemberId,
} from '#domain/restaurant/staff-member-id.value-object.ts';

export function unwrap<Success>(either: Either<unknown, Success>): Success {
  if (either.isLeft()) throw new Error(`expected a right, got ${JSON.stringify(either.failure)}`);
  return either.success;
}

export const pizzeriaId: RestaurantId = unwrap(
  parseRestaurantId('0199a5d0-0000-7000-8000-0000000000b1'),
);

export const staffAId: StaffMemberId = unwrap(
  parseStaffMemberId('0199a5d0-0000-7000-8000-0000000000e1'),
);

export const staffBId: StaffMemberId = unwrap(
  parseStaffMemberId('0199a5d0-0000-7000-8000-0000000000e2'),
);

export const onboardedAt = new Date('2026-10-04T12:00:00.000Z');

export const pizzeriaProfile: RawRestaurantProfile = {
  name: 'Pizzaria Bella',
  category: 'Pizza',
  address: {
    street: 'Avenida Paulista',
    number: '1000',
    city: 'Sao Paulo',
    postalCode: '01310-100',
    location: { latitude: -23.5614, longitude: -46.6559 },
  },
  timeZone: 'America/Sao_Paulo',
  openingHours: [
    { dayOfWeek: 'FRIDAY', opensAt: '18:00', closesAt: '23:30' },
    { dayOfWeek: 'SATURDAY', opensAt: '18:00', closesAt: '02:00' },
  ],
  minimumOrderInCents: 2000n,
};

export const margherita: RawMenuItem = {
  menuItemId: '0199a5d0-0000-7000-8000-000000000d01',
  name: 'Margherita',
  priceInCents: 4500n,
  isAvailable: true,
};

export const guarana: RawMenuItem = {
  menuItemId: '0199a5d0-0000-7000-8000-000000000d02',
  name: 'Guarana',
  priceInCents: 800n,
  isAvailable: false,
};

export function menuOf(rawMenuItems: readonly RawMenuItem[]): Menu {
  return unwrap(parseMenu(rawMenuItems));
}

export function onboardRestaurant(overrides: Partial<OnboardRestaurantInput> = {}): Restaurant {
  return unwrap(
    Restaurant.onboard({
      restaurantId: pizzeriaId,
      owner: staffAId,
      profile: pizzeriaProfile,
      onboardedAt,
      ...overrides,
    }),
  );
}

export function buildRestaurant(overrides: Partial<RestaurantSnapshot> = {}): Restaurant {
  const menuItems: readonly MenuItem[] = menuOf([margherita, guarana]);
  return Restaurant.restore({
    restaurantId: pizzeriaId,
    ...unwrap(parseRestaurantProfile(pizzeriaProfile)),
    menuItems,
    members: [{ staffMemberId: staffAId, role: 'OWNER' }],
    version: 1,
    ...overrides,
  });
}
