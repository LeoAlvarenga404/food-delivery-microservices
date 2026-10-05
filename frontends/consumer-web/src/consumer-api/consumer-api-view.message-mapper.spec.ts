import { describe, expect, it } from 'vitest';
import { describeProblem } from './consumer-api-view.message-mapper.ts';

describe('describeProblem', () => {
  it.each([
    [422, 'MinimumOrderNotReached', 'The order is below the minimum of the restaurant.'],
    [422, 'RestaurantClosed', 'The restaurant is closed now.'],
    [409, 'ConsumerAlreadyRegistered', 'You are already registered.'],
    [
      422,
      'IdempotencyKeyReused',
      'This cart was already ordered with other details. Empty the cart to order again.',
    ],
    [400, 'InvalidEmail', 'Some fields are not valid. Check them and try again.'],
    [400, undefined, 'Some fields are not valid. Check them and try again.'],
    [503, undefined, 'The service is busy. Try again in a moment.'],
    [504, undefined, 'The service is busy. Try again in a moment.'],
    [500, undefined, 'Something went wrong (HTTP 500).'],
    [422, 'NotAReason', 'Something went wrong (HTTP 422).'],
  ])('describes HTTP %s with reason %s', (status, reason, expected) => {
    expect(describeProblem(status, reason)).toBe(expected);
  });
});
