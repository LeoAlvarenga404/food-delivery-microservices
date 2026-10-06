import { describe, expect, it } from 'vitest';
import {
  amountTextPattern,
  describeProblem,
  toAmountInCents,
  toAmountText,
} from './restaurant-api-view.message-mapper.ts';

describe('describeProblem', () => {
  it.each([
    [400, 'InvalidOpeningPeriod', 'Check the opening hours.'],
    [400, 'InvalidOpeningPeriodCount', 'Open the restaurant on at least one day.'],
    [400, 'InvalidMenuItem', 'Check the name and the price of every item.'],
    [403, 'NotRestaurantMember', 'You are not a member of this restaurant.'],
    [
      409,
      'ConcurrentMenuRevision',
      'Someone else revised the menu meanwhile. Reload the page to see it.',
    ],
  ])('describes a %i refused with %s', (status, reason, expected) => {
    expect(describeProblem(status, reason)).toBe(expected);
  });

  it.each([
    [400, 'Some fields are not valid. Check them and try again.'],
    [401, 'Your session ended. Reload the page to sign in again.'],
    [403, 'Your account may not open this restaurant.'],
    [404, 'This restaurant does not exist.'],
    [503, 'The service is busy. Try again in a moment.'],
    [504, 'The service is busy. Try again in a moment.'],
    [500, 'Something went wrong (HTTP 500).'],
  ])('describes a %i without a known reason by its status', (status, expected) => {
    expect(describeProblem(status, undefined)).toBe(expected);
    expect(describeProblem(status, 'ReasonAddedLater')).toBe(expected);
  });
});

describe('amounts', () => {
  it.each([
    ['39.90', '3990'],
    ['39.9', '3990'],
    ['40', '4000'],
    ['0.05', '5'],
    ['123456789.99', '12345678999'],
  ])('reads %s as %s cents', (amountText, expected) => {
    expect(amountTextPattern.test(amountText)).toBe(true);
    expect(toAmountInCents(amountText)).toBe(expected);
  });

  it.each(['', '39,90', '39.999', '-1', '1e3', ' 40', '.50', '1234567890'])(
    'refuses %j as an amount',
    (amountText) => {
      expect(amountTextPattern.test(amountText)).toBe(false);
    },
  );

  it.each([
    ['3990', '39.90'],
    ['5', '0.05'],
    ['9007199254740993', '90071992547409.93'],
  ])('writes %s cents as %s', (amountInCents, expected) => {
    expect(toAmountText(amountInCents)).toBe(expected);
  });
});
