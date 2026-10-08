import { left, right } from '@fd/domain';
import { describe, expect, it } from 'vitest';
import { parsePreparationTime } from './preparation-time.value-object.ts';

describe('parsePreparationTime', () => {
  it.each([1, 15, 120])('accepts %s minutes', (preparationTimeInMinutes) => {
    expect(parsePreparationTime(preparationTimeInMinutes)).toEqual(right(preparationTimeInMinutes));
  });

  it.each([0, 121, 1.5, -15, Number.NaN])('refuses %s minutes', (preparationTimeInMinutes) => {
    expect(parsePreparationTime(preparationTimeInMinutes)).toEqual(
      left({ type: 'InvalidPreparationTime', preparationTimeInMinutes }),
    );
  });
});
