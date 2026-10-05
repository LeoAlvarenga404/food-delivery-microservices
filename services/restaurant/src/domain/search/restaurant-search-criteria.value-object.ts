import { left, right, type Either } from '@fd/domain';
import type { GeoPoint } from '../restaurant/restaurant-address.value-object.ts';

export interface RestaurantSearchCriteria {
  readonly text: string;
  readonly category: string | undefined;
  readonly origin: GeoPoint | undefined;
  readonly radiusInKilometers: number | undefined;
  readonly limit: number;
}

export interface InvalidSearchCriteria {
  readonly type: 'InvalidSearchCriteria';
  readonly field: keyof RestaurantSearchCriteria;
}

const maximumTextLength = 100;
const maximumCategoryLength = 50;
const maximumRadiusInKilometers = 50;
const maximumLimit = 50;
const controlCharacterPattern = /\p{Cc}/u;

function isValidText(text: string, maximumLength: number): boolean {
  return text.length <= maximumLength && !controlCharacterPattern.test(text);
}

function isValidOrigin(origin: GeoPoint | undefined): boolean {
  if (origin === undefined) return true;
  return Math.abs(origin.latitude) <= 90 && Math.abs(origin.longitude) <= 180;
}

function isValidRadius(criteria: RestaurantSearchCriteria): boolean {
  const { radiusInKilometers } = criteria;
  if (radiusInKilometers === undefined) return true;
  const isWithinRange = radiusInKilometers > 0 && radiusInKilometers <= maximumRadiusInKilometers;
  return isWithinRange && criteria.origin !== undefined;
}

function isValidCategory(category: string | undefined): boolean {
  if (category === undefined) return true;
  return category.length > 0 && isValidText(category, maximumCategoryLength);
}

function isValidLimit(limit: number): boolean {
  return Number.isInteger(limit) && limit >= 1 && limit <= maximumLimit;
}

function invalidField(
  criteria: RestaurantSearchCriteria,
): keyof RestaurantSearchCriteria | undefined {
  if (!isValidText(criteria.text, maximumTextLength)) return 'text';
  if (!isValidCategory(criteria.category)) return 'category';
  if (!isValidOrigin(criteria.origin)) return 'origin';
  if (!isValidRadius(criteria)) return 'radiusInKilometers';
  return isValidLimit(criteria.limit) ? undefined : 'limit';
}

export function parseRestaurantSearchCriteria(
  rawCriteria: RestaurantSearchCriteria,
): Either<InvalidSearchCriteria, RestaurantSearchCriteria> {
  const criteria: RestaurantSearchCriteria = {
    ...rawCriteria,
    text: rawCriteria.text.trim(),
    category: rawCriteria.category?.trim(),
  };
  const field = invalidField(criteria);
  return field === undefined ? right(criteria) : left({ type: 'InvalidSearchCriteria', field });
}
