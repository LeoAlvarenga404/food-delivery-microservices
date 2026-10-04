import { left, right, type Brand, type Either } from '@fd/domain';

export type RestaurantCategory = Brand<string, 'RestaurantCategory'>;

export interface InvalidRestaurantCategory {
  readonly type: 'InvalidRestaurantCategory';
}

const maximumCategoryLength = 50;
const controlCharacterPattern = /\p{Cc}/u;

export function parseRestaurantCategory(
  rawCategory: string,
): Either<InvalidRestaurantCategory, RestaurantCategory> {
  const category = rawCategory.trim();
  if (
    category.length === 0 ||
    category.length > maximumCategoryLength ||
    controlCharacterPattern.test(category)
  ) {
    return left({ type: 'InvalidRestaurantCategory' });
  }
  return right(category as RestaurantCategory);
}
