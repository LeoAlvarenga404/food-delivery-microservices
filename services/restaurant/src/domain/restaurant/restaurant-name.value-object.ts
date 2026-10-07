import { left, right, type Brand, type Either } from '@fd/domain';

export type RestaurantName = Brand<string, 'RestaurantName'>;

export interface InvalidRestaurantName {
  readonly type: 'InvalidRestaurantName';
}

const maximumNameLength = 100;
const controlCharacterPattern = /\p{Cc}/u;

export function parseRestaurantName(
  rawName: string,
): Either<InvalidRestaurantName, RestaurantName> {
  const name = rawName.trim();
  if (name.length === 0 || name.length > maximumNameLength || controlCharacterPattern.test(name)) {
    return left({ type: 'InvalidRestaurantName' });
  }
  return right(name as RestaurantName);
}
