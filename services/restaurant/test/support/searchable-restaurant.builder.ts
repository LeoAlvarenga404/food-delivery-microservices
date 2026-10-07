import type { SearchableRestaurant } from '#application/ports/restaurant-search-index.port.ts';
import type { RawMenuItem } from '#domain/restaurant/menu-item.value-object.ts';
import type { RawOpeningPeriod } from '#domain/restaurant/opening-period.value-object.ts';
import type { GeoPoint } from '#domain/restaurant/restaurant-address.value-object.ts';
import { parseRestaurantId } from '#domain/restaurant/restaurant-id.value-object.ts';
import { parseRestaurantProfile } from '#domain/restaurant/restaurant-profile.value-object.ts';
import { guarana, margherita, menuOf, pizzeriaProfile, unwrap } from './restaurant.builder.ts';

interface SearchableRestaurantFields {
  readonly restaurantId: string;
  readonly version: number;
  readonly name: string;
  readonly category: string;
  readonly location: GeoPoint;
  readonly timeZone: string;
  readonly openingHours: readonly RawOpeningPeriod[];
  readonly menuItems: readonly RawMenuItem[];
}

export const paulista: GeoPoint = { latitude: -23.5614, longitude: -46.6559 };

const pizzeriaFields: SearchableRestaurantFields = {
  restaurantId: '0199a5d0-0000-7000-8000-0000000000b1',
  version: 1,
  name: pizzeriaProfile.name,
  category: pizzeriaProfile.category,
  location: paulista,
  timeZone: pizzeriaProfile.timeZone,
  openingHours: pizzeriaProfile.openingHours,
  menuItems: [margherita, guarana],
};

export function buildSearchableRestaurant(
  overrides: Partial<SearchableRestaurantFields> = {},
): SearchableRestaurant {
  const fields = { ...pizzeriaFields, ...overrides };
  const profile = unwrap(
    parseRestaurantProfile({
      ...pizzeriaProfile,
      name: fields.name,
      category: fields.category,
      address: { ...pizzeriaProfile.address, location: fields.location },
      timeZone: fields.timeZone,
      openingHours: fields.openingHours,
    }),
  );
  return {
    restaurantId: unwrap(parseRestaurantId(fields.restaurantId)),
    version: fields.version,
    ...profile,
    menuItems: menuOf(fields.menuItems),
  };
}
