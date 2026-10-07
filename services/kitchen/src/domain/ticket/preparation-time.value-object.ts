import { left, right, type Brand, type Either } from '@fd/domain';

export type PreparationTimeInMinutes = Brand<number, 'PreparationTimeInMinutes'>;

export interface InvalidPreparationTime {
  readonly type: 'InvalidPreparationTime';
  readonly preparationTimeInMinutes: number;
}

const shortestPreparationTimeInMinutes = 1;
const longestPreparationTimeInMinutes = 120;

export function parsePreparationTime(
  preparationTimeInMinutes: number,
): Either<InvalidPreparationTime, PreparationTimeInMinutes> {
  const isWithinBounds =
    Number.isInteger(preparationTimeInMinutes) &&
    preparationTimeInMinutes >= shortestPreparationTimeInMinutes &&
    preparationTimeInMinutes <= longestPreparationTimeInMinutes;
  if (!isWithinBounds) return left({ type: 'InvalidPreparationTime', preparationTimeInMinutes });
  return right(preparationTimeInMinutes as PreparationTimeInMinutes);
}
