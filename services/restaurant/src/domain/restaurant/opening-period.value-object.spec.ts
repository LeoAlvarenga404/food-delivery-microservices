import { left, right } from '@fd/domain';
import { describe, expect, it } from 'vitest';
import { parseOpeningPeriod } from './opening-period.value-object.ts';

const fridayEvening = { dayOfWeek: 'FRIDAY', opensAt: '18:00', closesAt: '23:30' };

describe('parseOpeningPeriod', () => {
  it('accepts a period inside one day', () => {
    expect(parseOpeningPeriod(fridayEvening)).toEqual(right(fridayEvening));
  });

  it('accepts a period that closes after midnight as an overnight period', () => {
    const overnight = { dayOfWeek: 'SATURDAY', opensAt: '22:00', closesAt: '02:00' };

    expect(parseOpeningPeriod(overnight)).toEqual(right(overnight));
  });

  it('accepts the first and the last minute of a day', () => {
    const wholeDay = { dayOfWeek: 'SUNDAY', opensAt: '00:00', closesAt: '23:59' };

    expect(parseOpeningPeriod(wholeDay)).toEqual(right(wholeDay));
  });

  it.each([
    { field: 'dayOfWeek', period: { ...fridayEvening, dayOfWeek: 'friday' } },
    { field: 'dayOfWeek', period: { ...fridayEvening, dayOfWeek: 'UNSPECIFIED' } },
    { field: 'opensAt', period: { ...fridayEvening, opensAt: '24:00' } },
    { field: 'opensAt', period: { ...fridayEvening, opensAt: '8:00' } },
    { field: 'closesAt', period: { ...fridayEvening, closesAt: '23:60' } },
    { field: 'closesAt', period: { ...fridayEvening, closesAt: ' 23:30' } },
    { field: 'closesAt', period: { ...fridayEvening, closesAt: '18:00' } },
  ])('refuses a period with an invalid $field: $period', ({ field, period }) => {
    expect(parseOpeningPeriod(period)).toEqual(left({ type: 'InvalidOpeningPeriod', field }));
  });
});
