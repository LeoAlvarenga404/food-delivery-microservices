import { isUuid, left, right, type Brand, type Either } from '@fd/domain';

export type RestaurantId = Brand<string, 'RestaurantId'>;

export interface InvalidRestaurantId {
  readonly type: 'InvalidRestaurantId';
  readonly rawRestaurantId: string;
}

export function parseRestaurantId(
  rawRestaurantId: string,
): Either<InvalidRestaurantId, RestaurantId> {
  if (!isUuid(rawRestaurantId)) return left({ type: 'InvalidRestaurantId', rawRestaurantId });
  return right(rawRestaurantId as RestaurantId);
}
