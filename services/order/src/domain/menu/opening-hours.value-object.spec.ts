import { left, right } from '@fd/domain';
import { describe, expect, it } from 'vitest';
import {
  isOpenAt,
  parseOpeningHours,
  type OpeningHours,
  type RawOpeningHours,
} from './opening-hours.value-object.ts';

const pizzeriaHours: RawOpeningHours = {
  timeZone: 'America/Sao_Paulo',
  periods: [
    { dayOfWeek: 'FRIDAY', opensAt: '18:00', closesAt: '23:30' },
    { dayOfWeek: 'SATURDAY', opensAt: '18:00', closesAt: '02:00' },
  ],
};

const everyDayOfWeek = [
  'MONDAY',
  'TUESDAY',
  'WEDNESDAY',
  'THURSDAY',
  'FRIDAY',
  'SATURDAY',
  'SUNDAY',
];

function openingHoursOf(rawOpeningHours: RawOpeningHours): OpeningHours {
  const parsed = parseOpeningHours(rawOpeningHours);
  if (parsed.isLeft()) throw new Error(`expected valid opening hours, got ${parsed.failure.field}`);
  return parsed.success;
}

describe('parseOpeningHours', () => {
  it('accepts a time zone and periods with local opening and closing times', () => {
    expect(parseOpeningHours(pizzeriaHours)).toEqual(right(pizzeriaHours));
  });

  it.each<{ readonly invalidPart: string; readonly rawOpeningHours: RawOpeningHours }>([
    { invalidPart: 'timeZone', rawOpeningHours: { ...pizzeriaHours, timeZone: 'Mars/Olympus' } },
    { invalidPart: 'timeZone', rawOpeningHours: { ...pizzeriaHours, timeZone: '' } },
    {
      invalidPart: 'dayOfWeek',
      rawOpeningHours: {
        ...pizzeriaHours,
        periods: [
          ...pizzeriaHours.periods,
          { dayOfWeek: 'FUNDAY', opensAt: '18:00', closesAt: '23:30' },
        ],
      },
    },
    {
      invalidPart: 'opensAt',
      rawOpeningHours: {
        ...pizzeriaHours,
        periods: [{ dayOfWeek: 'FRIDAY', opensAt: '24:00', closesAt: '23:30' }],
      },
    },
    {
      invalidPart: 'opensAt',
      rawOpeningHours: {
        ...pizzeriaHours,
        periods: [{ dayOfWeek: 'FRIDAY', opensAt: '9:00', closesAt: '23:30' }],
      },
    },
    {
      invalidPart: 'opensAt',
      rawOpeningHours: {
        ...pizzeriaHours,
        periods: [{ dayOfWeek: 'FRIDAY', opensAt: '118:00', closesAt: '23:30' }],
      },
    },
    {
      invalidPart: 'opensAt',
      rawOpeningHours: {
        ...pizzeriaHours,
        periods: [{ dayOfWeek: 'FRIDAY', opensAt: '18:60', closesAt: '23:30' }],
      },
    },
    {
      invalidPart: 'closesAt',
      rawOpeningHours: {
        ...pizzeriaHours,
        periods: [{ dayOfWeek: 'FRIDAY', opensAt: '18:00', closesAt: '23:300' }],
      },
    },
    {
      invalidPart: 'closesAt',
      rawOpeningHours: {
        ...pizzeriaHours,
        periods: [{ dayOfWeek: 'FRIDAY', opensAt: '18:00', closesAt: '18:00' }],
      },
    },
  ])('refuses opening hours with an invalid $invalidPart', ({ invalidPart, rawOpeningHours }) => {
    expect(parseOpeningHours(rawOpeningHours)).toEqual(
      left({ type: 'InvalidOpeningHours', field: invalidPart }),
    );
  });
});

describe('isOpenAt', () => {
  it.each([
    { moment: 'Friday 17:59, the minute before opening', instant: '2026-10-02T20:59:00Z' },
    { moment: 'Friday 23:30, the closing minute', instant: '2026-10-03T02:30:00Z' },
    {
      moment: 'Saturday 00:30, after a period that does not cross midnight',
      instant: '2026-10-03T03:30:00Z',
    },
    { moment: 'Sunday 02:00, the closing minute after midnight', instant: '2026-10-04T05:00:00Z' },
    { moment: 'Thursday 20:00, a day without a period', instant: '2026-10-01T23:00:00Z' },
  ])('is closed on $moment', ({ instant }) => {
    expect(isOpenAt(openingHoursOf(pizzeriaHours), new Date(instant))).toBe(false);
  });

  it.each([
    { moment: 'Friday 18:00, the opening minute', instant: '2026-10-02T21:00:00Z' },
    { moment: 'Friday 23:29, the minute before closing', instant: '2026-10-03T02:29:00Z' },
    { moment: 'Saturday 23:59, before midnight', instant: '2026-10-04T02:59:00Z' },
    {
      moment: 'Sunday 01:59, after midnight of an overnight period',
      instant: '2026-10-04T04:59:00Z',
    },
  ])('is open on $moment', ({ instant }) => {
    expect(isOpenAt(openingHoursOf(pizzeriaHours), new Date(instant))).toBe(true);
  });

  it('reads the clock of the time zone of the restaurant', () => {
    const lunchtime = new Date('2026-10-02T18:30:00Z');
    const hoursInUtc = openingHoursOf({ ...pizzeriaHours, timeZone: 'UTC' });

    expect(isOpenAt(hoursInUtc, lunchtime)).toBe(true);
    expect(isOpenAt(openingHoursOf(pizzeriaHours), lunchtime)).toBe(false);
  });

  it('carries an overnight Sunday period into Monday morning', () => {
    const sundayNights = openingHoursOf({
      timeZone: 'America/Sao_Paulo',
      periods: [{ dayOfWeek: 'SUNDAY', opensAt: '18:00', closesAt: '02:00' }],
    });

    expect(isOpenAt(sundayNights, new Date('2026-10-05T04:00:00Z'))).toBe(true);
  });

  it('follows the daylight saving time of the time zone of the restaurant', () => {
    const newYorkEvenings = openingHoursOf({
      timeZone: 'America/New_York',
      periods: [{ dayOfWeek: 'MONDAY', opensAt: '18:00', closesAt: '22:00' }],
    });

    expect(isOpenAt(newYorkEvenings, new Date('2026-07-06T22:00:00Z'))).toBe(true);
    expect(isOpenAt(newYorkEvenings, new Date('2026-01-05T22:00:00Z'))).toBe(false);
  });

  it.each([
    '2026-10-02T03:00:00Z',
    '2026-10-02T14:59:00Z',
    '2026-10-02T15:00:00Z',
    '2026-10-03T02:59:00Z',
  ])(
    'stays open around the clock with a morning and an overnight period every day, at %s',
    (instant) => {
      const aroundTheClock = openingHoursOf({
        timeZone: 'America/Sao_Paulo',
        periods: everyDayOfWeek.flatMap((dayOfWeek) => [
          { dayOfWeek, opensAt: '00:00', closesAt: '12:00' },
          { dayOfWeek, opensAt: '12:00', closesAt: '00:00' },
        ]),
      });

      expect(isOpenAt(aroundTheClock, new Date(instant))).toBe(true);
    },
  );
});
