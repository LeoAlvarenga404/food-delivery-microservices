import { left, right, type Either } from '@fd/domain';
import {
  parseOpeningPeriod,
  type InvalidOpeningPeriod,
  type OpeningPeriod,
  type RawOpeningPeriod,
} from './opening-period.value-object.ts';
import {
  parseRestaurantAddress,
  type InvalidRestaurantAddress,
  type RestaurantAddress,
} from './restaurant-address.value-object.ts';
import {
  parseRestaurantCategory,
  type InvalidRestaurantCategory,
  type RestaurantCategory,
} from './restaurant-category.value-object.ts';
import {
  parseRestaurantName,
  type InvalidRestaurantName,
  type RestaurantName,
} from './restaurant-name.value-object.ts';
import { parseTimeZone, type InvalidTimeZone, type TimeZone } from './time-zone.value-object.ts';

export interface RestaurantProfile {
  readonly name: RestaurantName;
  readonly category: RestaurantCategory;
  readonly address: RestaurantAddress;
  readonly timeZone: TimeZone;
  readonly openingHours: readonly OpeningPeriod[];
  readonly minimumOrderInCents: bigint;
}

export interface RawRestaurantProfile {
  readonly name: string;
  readonly category: string;
  readonly address: RestaurantAddress;
  readonly timeZone: string;
  readonly openingHours: readonly RawOpeningPeriod[];
  readonly minimumOrderInCents: bigint;
}

export interface InvalidOpeningPeriodCount {
  readonly type: 'InvalidOpeningPeriodCount';
  readonly openingPeriodCount: number;
}

export interface InvalidMinimumOrder {
  readonly type: 'InvalidMinimumOrder';
}

export type InvalidRestaurantProfile =
  | InvalidRestaurantName
  | InvalidRestaurantCategory
  | InvalidRestaurantAddress
  | InvalidTimeZone
  | InvalidOpeningPeriod
  | InvalidOpeningPeriodCount
  | InvalidMinimumOrder;

const maximumOpeningPeriodCount = 21;
const maximumMinimumOrderInCents = 10_000_000n;

function parseOpeningHours(
  rawOpeningHours: readonly RawOpeningPeriod[],
): Either<InvalidOpeningPeriod | InvalidOpeningPeriodCount, readonly OpeningPeriod[]> {
  const openingPeriodCount = rawOpeningHours.length;
  if (openingPeriodCount === 0 || openingPeriodCount > maximumOpeningPeriodCount) {
    return left({ type: 'InvalidOpeningPeriodCount', openingPeriodCount });
  }
  const openingHours: OpeningPeriod[] = [];
  for (const rawPeriod of rawOpeningHours) {
    const period = parseOpeningPeriod(rawPeriod);
    if (period.isLeft()) return period;
    openingHours.push(period.success);
  }
  return right(openingHours);
}

function parseMinimumOrder(minimumOrderInCents: bigint): Either<InvalidMinimumOrder, bigint> {
  if (minimumOrderInCents < 0n || minimumOrderInCents > maximumMinimumOrderInCents) {
    return left({ type: 'InvalidMinimumOrder' });
  }
  return right(minimumOrderInCents);
}

export function parseRestaurantProfile(
  rawProfile: RawRestaurantProfile,
): Either<InvalidRestaurantProfile, RestaurantProfile> {
  const name = parseRestaurantName(rawProfile.name);
  if (name.isLeft()) return name;
  const category = parseRestaurantCategory(rawProfile.category);
  if (category.isLeft()) return category;
  const address = parseRestaurantAddress(rawProfile.address);
  if (address.isLeft()) return address;
  const timeZone = parseTimeZone(rawProfile.timeZone);
  if (timeZone.isLeft()) return timeZone;
  const openingHours = parseOpeningHours(rawProfile.openingHours);
  if (openingHours.isLeft()) return openingHours;
  const minimumOrderInCents = parseMinimumOrder(rawProfile.minimumOrderInCents);
  if (minimumOrderInCents.isLeft()) return minimumOrderInCents;
  return right({
    name: name.success,
    category: category.success,
    address: address.success,
    timeZone: timeZone.success,
    openingHours: openingHours.success,
    minimumOrderInCents: minimumOrderInCents.success,
  });
}
