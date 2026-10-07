import type { SearchableRestaurant } from '#application/ports/restaurant-search-index.port.ts';
import type { DayOfWeek, OpeningPeriod } from '#domain/restaurant/opening-period.value-object.ts';

export interface RestaurantSearchDocument {
  readonly restaurantId: string;
  readonly name: string;
  readonly category: string;
  readonly menuItemNames: readonly string[];
  readonly location: { readonly lat: number; readonly lon: number };
  readonly timeZone: string;
  readonly openingPeriodCodes: readonly number[];
}

export const minutesPerWeek = 10_080;
export const openingPeriodCodeBase = 10_000;

const minutesPerDay = 1440;
const daysOfWeek: readonly DayOfWeek[] = [
  'MONDAY',
  'TUESDAY',
  'WEDNESDAY',
  'THURSDAY',
  'FRIDAY',
  'SATURDAY',
  'SUNDAY',
];

function minutesOf(localTime: string): number {
  return Number(localTime.slice(0, 2)) * 60 + Number(localTime.slice(3, 5));
}

function openingPeriodCodeOf(period: OpeningPeriod): number {
  const opensAt = minutesOf(period.opensAt);
  const durationInMinutes = (minutesOf(period.closesAt) - opensAt + minutesPerDay) % minutesPerDay;
  const opensAtMinuteOfWeek = daysOfWeek.indexOf(period.dayOfWeek) * minutesPerDay + opensAt;
  return opensAtMinuteOfWeek * openingPeriodCodeBase + durationInMinutes;
}

export const restaurantSearchDocumentPersistenceMapper = {
  toDocument(restaurant: SearchableRestaurant): RestaurantSearchDocument {
    const { location } = restaurant.address;
    return {
      restaurantId: restaurant.restaurantId,
      name: restaurant.name,
      category: restaurant.category,
      menuItemNames: restaurant.menuItems
        .filter((menuItem) => menuItem.isAvailable)
        .map((menuItem) => menuItem.name),
      location: { lat: location.latitude, lon: location.longitude },
      timeZone: restaurant.timeZone,
      openingPeriodCodes: restaurant.openingHours.map(openingPeriodCodeOf),
    };
  },
};
