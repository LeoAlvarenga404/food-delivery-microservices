import { left, right, type Either } from '@fd/domain';

export interface GeoPoint {
  readonly latitude: number;
  readonly longitude: number;
}

export interface RestaurantAddress {
  readonly street: string;
  readonly number: string;
  readonly city: string;
  readonly postalCode: string;
  readonly location: GeoPoint;
}

type AddressTextField = Exclude<keyof RestaurantAddress, 'location'>;

export interface InvalidRestaurantAddress {
  readonly type: 'InvalidRestaurantAddress';
  readonly field: AddressTextField | keyof GeoPoint;
}

const maximumFieldLength = 100;
const controlCharacterPattern = /\p{Cc}/u;
const textFields: readonly AddressTextField[] = ['street', 'number', 'city', 'postalCode'];

function isValidText(fieldText: string): boolean {
  return (
    fieldText.length > 0 &&
    fieldText.length <= maximumFieldLength &&
    !controlCharacterPattern.test(fieldText)
  );
}

function isWithin(coordinate: number, limitInDegrees: number): boolean {
  return Number.isFinite(coordinate) && Math.abs(coordinate) <= limitInDegrees;
}

function invalidField(address: RestaurantAddress): InvalidRestaurantAddress['field'] | undefined {
  const invalidText = textFields.find((field) => !isValidText(address[field]));
  if (invalidText !== undefined) return invalidText;
  if (!isWithin(address.location.latitude, 90)) return 'latitude';
  return isWithin(address.location.longitude, 180) ? undefined : 'longitude';
}

export function parseRestaurantAddress(
  rawAddress: RestaurantAddress,
): Either<InvalidRestaurantAddress, RestaurantAddress> {
  const address: RestaurantAddress = {
    street: rawAddress.street.trim(),
    number: rawAddress.number.trim(),
    city: rawAddress.city.trim(),
    postalCode: rawAddress.postalCode.trim(),
    location: { latitude: rawAddress.location.latitude, longitude: rawAddress.location.longitude },
  };
  const field = invalidField(address);
  return field === undefined ? right(address) : left({ type: 'InvalidRestaurantAddress', field });
}
