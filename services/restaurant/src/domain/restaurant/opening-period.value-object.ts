import { left, right, type Brand, type Either } from '@fd/domain';

export type DayOfWeek =
  'MONDAY' | 'TUESDAY' | 'WEDNESDAY' | 'THURSDAY' | 'FRIDAY' | 'SATURDAY' | 'SUNDAY';

export type LocalTime = Brand<string, 'LocalTime'>;

export interface OpeningPeriod {
  readonly dayOfWeek: DayOfWeek;
  readonly opensAt: LocalTime;
  readonly closesAt: LocalTime;
}

export interface RawOpeningPeriod {
  readonly dayOfWeek: string;
  readonly opensAt: string;
  readonly closesAt: string;
}

export interface InvalidOpeningPeriod {
  readonly type: 'InvalidOpeningPeriod';
  readonly field: keyof OpeningPeriod;
}

const daysOfWeek: readonly string[] = [
  'MONDAY',
  'TUESDAY',
  'WEDNESDAY',
  'THURSDAY',
  'FRIDAY',
  'SATURDAY',
  'SUNDAY',
];
const localTimePattern = /^(?:[01]\d|2[0-3]):[0-5]\d$/;

function invalidField(rawPeriod: RawOpeningPeriod): keyof OpeningPeriod | undefined {
  if (!daysOfWeek.includes(rawPeriod.dayOfWeek)) return 'dayOfWeek';
  if (!localTimePattern.test(rawPeriod.opensAt)) return 'opensAt';
  const isClosingTimeValid =
    localTimePattern.test(rawPeriod.closesAt) && rawPeriod.closesAt !== rawPeriod.opensAt;
  return isClosingTimeValid ? undefined : 'closesAt';
}

export function parseOpeningPeriod(
  rawPeriod: RawOpeningPeriod,
): Either<InvalidOpeningPeriod, OpeningPeriod> {
  const field = invalidField(rawPeriod);
  if (field !== undefined) return left({ type: 'InvalidOpeningPeriod', field });
  return right({
    dayOfWeek: rawPeriod.dayOfWeek as DayOfWeek,
    opensAt: rawPeriod.opensAt as LocalTime,
    closesAt: rawPeriod.closesAt as LocalTime,
  });
}
