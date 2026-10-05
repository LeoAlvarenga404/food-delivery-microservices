import type { SearchRestaurantsResponse } from '@fd/contracts/fooddelivery/restaurant/v1/catalogue_pb.js';
import {
  DayOfWeek,
  type Address,
  type Restaurant,
} from '@fd/contracts/fooddelivery/restaurant/v1/events_pb.js';
import { z } from 'zod';

const amountInCentsSchema = z.string().regex(/^\d+$/);

export const restaurantSearchViewSchema = z.object({
  restaurants: z.array(
    z.object({
      restaurantId: z.uuid(),
      name: z.string(),
      category: z.string(),
      isOpenNow: z.boolean(),
      highlights: z.array(z.string()),
    }),
  ),
  categories: z.array(z.object({ category: z.string(), restaurantCount: z.int() })),
  suggestion: z.string().optional(),
});

export const publicRestaurantViewSchema = z.object({
  restaurantId: z.uuid(),
  version: z.int(),
  name: z.string(),
  category: z.string(),
  address: z.object({
    street: z.string(),
    number: z.string(),
    city: z.string(),
    postalCode: z.string(),
    location: z.object({ latitude: z.number(), longitude: z.number() }),
  }),
  timeZone: z.string(),
  openingHours: z.array(
    z.object({
      dayOfWeek: z.enum([
        'MONDAY',
        'TUESDAY',
        'WEDNESDAY',
        'THURSDAY',
        'FRIDAY',
        'SATURDAY',
        'SUNDAY',
      ]),
      opensAt: z.string(),
      closesAt: z.string(),
    }),
  ),
  minimumOrderInCents: amountInCentsSchema,
  currency: z.string(),
  menuItems: z.array(
    z.object({
      menuItemId: z.uuid(),
      name: z.string(),
      priceInCents: amountInCentsSchema,
      isAvailable: z.boolean(),
    }),
  ),
});

export type RestaurantSearchView = z.infer<typeof restaurantSearchViewSchema>;
export type PublicRestaurantView = z.infer<typeof publicRestaurantViewSchema>;

type DayName = PublicRestaurantView['openingHours'][number]['dayOfWeek'];

const dayNamesByContractDay = new Map<DayOfWeek, DayName>([
  [DayOfWeek.MONDAY, 'MONDAY'],
  [DayOfWeek.TUESDAY, 'TUESDAY'],
  [DayOfWeek.WEDNESDAY, 'WEDNESDAY'],
  [DayOfWeek.THURSDAY, 'THURSDAY'],
  [DayOfWeek.FRIDAY, 'FRIDAY'],
  [DayOfWeek.SATURDAY, 'SATURDAY'],
  [DayOfWeek.SUNDAY, 'SUNDAY'],
]);

function toDayName(dayOfWeek: DayOfWeek): DayName {
  const dayName = dayNamesByContractDay.get(dayOfWeek);
  if (dayName === undefined)
    throw new Error('the restaurant service answered a period without day');
  return dayName;
}

function toAddressView(address: Address | undefined): PublicRestaurantView['address'] {
  if (address?.location === undefined) {
    throw new Error('the restaurant service answered a restaurant without its location');
  }
  const { street, number, city, postalCode, location } = address;
  return {
    street,
    number,
    city,
    postalCode,
    location: { latitude: location.latitude, longitude: location.longitude },
  };
}

export function toRestaurantSearchView(response: SearchRestaurantsResponse): RestaurantSearchView {
  return {
    restaurants: response.hits.map(({ restaurantId, name, category, isOpenNow, highlights }) => ({
      restaurantId,
      name,
      category,
      isOpenNow,
      highlights,
    })),
    categories: response.categories.map(({ category, restaurantCount }) => ({
      category,
      restaurantCount,
    })),
    ...(response.suggestion !== '' && { suggestion: response.suggestion }),
  };
}

export function toPublicRestaurantView(restaurant: Restaurant): PublicRestaurantView {
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
