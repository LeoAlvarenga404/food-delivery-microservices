import {
  DayOfWeek as ContractDayOfWeek,
  type Address,
  type GeoPoint as ContractGeoPoint,
  type MenuItem,
  type OpeningPeriod,
} from '@fd/contracts/fooddelivery/restaurant/v1/events_pb.js';
import type { OnboardRestaurantRequest } from '@fd/contracts/fooddelivery/restaurant/v1/service_pb.js';
import type { RawMenuItem } from '#domain/restaurant/menu-item.value-object.ts';
import type {
  DayOfWeek,
  RawOpeningPeriod,
} from '#domain/restaurant/opening-period.value-object.ts';
import type {
  GeoPoint,
  RestaurantAddress,
} from '#domain/restaurant/restaurant-address.value-object.ts';
import type { RawRestaurantProfile } from '#domain/restaurant/restaurant-profile.value-object.ts';

export type RestaurantProfileContract = Pick<
  OnboardRestaurantRequest,
  'name' | 'category' | 'address' | 'timeZone' | 'openingHours' | 'minimumOrderInCents'
>;

const domainDaysOfWeek: ReadonlyMap<ContractDayOfWeek, DayOfWeek> = new Map([
  [ContractDayOfWeek.MONDAY, 'MONDAY'],
  [ContractDayOfWeek.TUESDAY, 'TUESDAY'],
  [ContractDayOfWeek.WEDNESDAY, 'WEDNESDAY'],
  [ContractDayOfWeek.THURSDAY, 'THURSDAY'],
  [ContractDayOfWeek.FRIDAY, 'FRIDAY'],
  [ContractDayOfWeek.SATURDAY, 'SATURDAY'],
  [ContractDayOfWeek.SUNDAY, 'SUNDAY'],
]);

const missingLocation: GeoPoint = { latitude: Number.NaN, longitude: Number.NaN };

function toRawLocation(location: ContractGeoPoint | undefined): GeoPoint {
  if (location === undefined) return missingLocation;
  return { latitude: location.latitude, longitude: location.longitude };
}

function toRawAddress(address: Address | undefined): RestaurantAddress {
  if (address === undefined) {
    return { street: '', number: '', city: '', postalCode: '', location: missingLocation };
  }
  const { street, number, city, postalCode, location } = address;
  return { street, number, city, postalCode, location: toRawLocation(location) };
}

function toRawOpeningPeriod(period: OpeningPeriod): RawOpeningPeriod {
  return {
    dayOfWeek: domainDaysOfWeek.get(period.dayOfWeek) ?? 'UNSPECIFIED',
    opensAt: period.opensAt,
    closesAt: period.closesAt,
  };
}

export function toRawRestaurantProfile(request: RestaurantProfileContract): RawRestaurantProfile {
  return {
    name: request.name,
    category: request.category,
    address: toRawAddress(request.address),
    timeZone: request.timeZone,
    openingHours: request.openingHours.map(toRawOpeningPeriod),
    minimumOrderInCents: request.minimumOrderInCents,
  };
}

export function toRawMenuItems(menuItems: readonly MenuItem[]): readonly RawMenuItem[] {
  return menuItems.map(({ menuItemId, name, priceInCents, isAvailable }) => ({
    menuItemId,
    name,
    priceInCents,
    isAvailable,
  }));
}
