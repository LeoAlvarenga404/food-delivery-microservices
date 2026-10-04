import { left, right } from '@fd/domain';
import { describe, expect, it } from 'vitest';
import { parseTimeZone } from './time-zone.value-object.ts';

describe('parseTimeZone', () => {
  it.each([
    { rawTimeZone: 'America/Sao_Paulo', timeZone: 'America/Sao_Paulo' },
    { rawTimeZone: ' america/sao_paulo ', timeZone: 'America/Sao_Paulo' },
    { rawTimeZone: 'Brazil/East', timeZone: 'America/Sao_Paulo' },
    { rawTimeZone: 'UTC', timeZone: 'UTC' },
  ])('accepts $rawTimeZone as the IANA zone $timeZone', ({ rawTimeZone, timeZone }) => {
    expect(parseTimeZone(rawTimeZone)).toEqual(right(timeZone));
  });

  it.each([
    { scenario: 'an unknown zone', rawTimeZone: 'Mars/Olympus_Mons' },
    { scenario: 'a fixed offset', rawTimeZone: '-03:00' },
    { scenario: 'an empty zone', rawTimeZone: '' },
  ])('refuses $scenario', ({ rawTimeZone }) => {
    expect(parseTimeZone(rawTimeZone)).toEqual(left({ type: 'InvalidTimeZone' }));
  });
});
