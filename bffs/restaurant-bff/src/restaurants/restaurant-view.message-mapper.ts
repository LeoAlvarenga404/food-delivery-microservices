import { DayOfWeek, type Address } from '@fd/contracts/fooddelivery/restaurant/v1/events_pb.js';
import {
  MembershipRole,
  type GetRestaurantResponse,
  type ListMembershipsResponse,
} from '@fd/contracts/fooddelivery/restaurant/v1/service_pb.js';
import { z } from 'zod';

const amountInCentsSchema = z.string().regex(/^\d{1,18}$/);

export const openingPeriodSchema = z.object({
  dayOfWeek: z.enum(['MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY', 'SATURDAY', 'SUNDAY']),
  opensAt: z.string(),
  closesAt: z.string(),
});

export const addressSchema = z.object({
  street: z.string(),
  number: z.string(),
  city: z.string(),
  postalCode: z.string(),
  location: z.object({ latitude: z.number(), longitude: z.number() }),
});

export const menuItemSchema = z.object({
  menuItemId: z.string(),
  name: z.string(),
  priceInCents: amountInCentsSchema,
  isAvailable: z.boolean(),
});

export const onboardingSchema = z.object({
  name: z.string(),
  category: z.string(),
  address: addressSchema,
  timeZone: z.string(),
  openingHours: z.array(openingPeriodSchema),
  minimumOrderInCents: amountInCentsSchema,
});

export const restaurantViewSchema = onboardingSchema.extend({
  restaurantId: z.uuid(),
  version: z.int(),
  currency: z.string(),
  menuItems: z.array(menuItemSchema),
});

export const membershipsViewSchema = z.object({
  memberships: z.array(
    z.object({ restaurantId: z.uuid(), restaurantName: z.string(), role: z.enum(['OWNER']) }),
  ),
});

type OpeningPeriodView = z.infer<typeof openingPeriodSchema>;
export type RestaurantView = z.infer<typeof restaurantViewSchema>;
export type MembershipsView = z.infer<typeof membershipsViewSchema>;

const dayNames = new Map<DayOfWeek, OpeningPeriodView['dayOfWeek']>([
  [DayOfWeek.MONDAY, 'MONDAY'],
  [DayOfWeek.TUESDAY, 'TUESDAY'],
  [DayOfWeek.WEDNESDAY, 'WEDNESDAY'],
  [DayOfWeek.THURSDAY, 'THURSDAY'],
  [DayOfWeek.FRIDAY, 'FRIDAY'],
  [DayOfWeek.SATURDAY, 'SATURDAY'],
  [DayOfWeek.SUNDAY, 'SUNDAY'],
]);

function toDayName(dayOfWeek: DayOfWeek): OpeningPeriodView['dayOfWeek'] {
  const dayName = dayNames.get(dayOfWeek);
  if (dayName === undefined) throw new Error('the restaurant service answered without a day');
  return dayName;
}

function toAddressView(address: Address | undefined): RestaurantView['address'] {
  if (address?.location === undefined) {
    throw new Error('the restaurant service answered without a located address');
  }
  const { street, number, city, postalCode, location } = address;
  const { latitude, longitude } = location;
  return { street, number, city, postalCode, location: { latitude, longitude } };
}

export function toRestaurantView(response: GetRestaurantResponse): RestaurantView {
  const { restaurant } = response;
  if (restaurant === undefined) {
    throw new Error('the restaurant service answered without a restaurant');
  }
  return {
    restaurantId: restaurant.restaurantId,
    version: restaurant.version,
    name: restaurant.name,
    category: restaurant.category,
    address: toAddressView(restaurant.address),
    timeZone: restaurant.timeZone,
    openingHours: restaurant.openingHours.map(({ dayOfWeek, opensAt, closesAt }) => ({
      dayOfWeek: toDayName(dayOfWeek),
      opensAt,
      closesAt,
    })),
    minimumOrderInCents: restaurant.minimumOrderInCents.toString(),
    currency: restaurant.currency,
    menuItems: restaurant.menuItems.map(({ menuItemId, name, priceInCents, isAvailable }) => ({
      menuItemId,
      name,
      priceInCents: priceInCents.toString(),
      isAvailable,
    })),
  };
}

export function toMembershipsView(response: ListMembershipsResponse): MembershipsView {
  return {
    memberships: response.memberships.map(({ restaurantId, restaurantName, role }) => {
      if (role !== MembershipRole.OWNER) {
        throw new Error('the restaurant service answered an unknown membership role');
      }
      return { restaurantId, restaurantName, role: 'OWNER' };
    }),
  };
}
