import { left, right, type Brand, type Either } from '@fd/domain';

export type DayOfWeek =
  'MONDAY' | 'TUESDAY' | 'WEDNESDAY' | 'THURSDAY' | 'FRIDAY' | 'SATURDAY' | 'SUNDAY';

export interface OpeningPeriod {
  readonly dayOfWeek: DayOfWeek;
  readonly opensAt: string;
  readonly closesAt: string;
}

export type OpeningHours = Brand<
  { readonly timeZone: string; readonly periods: readonly OpeningPeriod[] },
  'OpeningHours'
>;

export interface RawOpeningPeriod {
  readonly dayOfWeek: string;
  readonly opensAt: string;
  readonly closesAt: string;
}

export interface RawOpeningHours {
  readonly timeZone: string;
  readonly periods: readonly RawOpeningPeriod[];
}

export interface InvalidOpeningHours {
  readonly type: 'InvalidOpeningHours';
  readonly field: 'timeZone' | keyof OpeningPeriod;
}

interface LocalMoment {
  readonly today: DayOfWeek | undefined;
  readonly yesterday: DayOfWeek | undefined;
  readonly time: string;
}

const daysOfWeek: readonly DayOfWeek[] = [
  'MONDAY',
  'TUESDAY',
  'WEDNESDAY',
  'THURSDAY',
  'FRIDAY',
  'SATURDAY',
  'SUNDAY',
];
const localTimePattern = /^(?:[01]\d|2[0-3]):[0-5]\d$/;

function localClockOf(timeZone: string): Intl.DateTimeFormat {
  return new Intl.DateTimeFormat('en-US', {
    timeZone,
    weekday: 'long',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  });
}

function isKnownTimeZone(timeZone: string): boolean {
  try {
    localClockOf(timeZone);
    return true;
  } catch {
    return false;
  }
}

function invalidField(rawPeriod: RawOpeningPeriod): keyof OpeningPeriod | undefined {
  if (!daysOfWeek.some((day) => day === rawPeriod.dayOfWeek)) return 'dayOfWeek';
  if (!localTimePattern.test(rawPeriod.opensAt)) return 'opensAt';
  const isClosingTimeValid =
    localTimePattern.test(rawPeriod.closesAt) && rawPeriod.closesAt !== rawPeriod.opensAt;
  return isClosingTimeValid ? undefined : 'closesAt';
}

export function parseOpeningHours(
  rawOpeningHours: RawOpeningHours,
): Either<InvalidOpeningHours, OpeningHours> {
  if (!isKnownTimeZone(rawOpeningHours.timeZone)) {
    return left({ type: 'InvalidOpeningHours', field: 'timeZone' });
  }
  for (const rawPeriod of rawOpeningHours.periods) {
    const field = invalidField(rawPeriod);
    if (field !== undefined) return left({ type: 'InvalidOpeningHours', field });
  }
  return right(rawOpeningHours as OpeningHours);
}

function localMomentOf(timeZone: string, instant: Date): LocalMoment {
  const parts = new Map(
    localClockOf(timeZone)
      .formatToParts(instant)
      .map((part) => [part.type, part.value]),
  );
  const todayIndex = daysOfWeek.findIndex((day) => day === parts.get('weekday')?.toUpperCase());
  return {
    today: daysOfWeek[todayIndex],
    yesterday: daysOfWeek[(todayIndex + daysOfWeek.length - 1) % daysOfWeek.length],
    time: `${parts.get('hour') ?? ''}:${parts.get('minute') ?? ''}`,
  };
}

function isCoveredBy(period: OpeningPeriod, moment: LocalMoment): boolean {
  const isOvernight = period.closesAt < period.opensAt;
  if (period.dayOfWeek === moment.today && moment.time >= period.opensAt) {
    return isOvernight || moment.time < period.closesAt;
  }
  return isOvernight && period.dayOfWeek === moment.yesterday && moment.time < period.closesAt;
}

export function isOpenAt(openingHours: OpeningHours, instant: Date): boolean {
  const moment = localMomentOf(openingHours.timeZone, instant);
  return openingHours.periods.some((period) => isCoveredBy(period, moment));
}
