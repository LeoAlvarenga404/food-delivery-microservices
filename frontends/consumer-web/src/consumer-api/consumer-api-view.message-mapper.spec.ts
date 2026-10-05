import { describe, expect, it } from 'vitest';
import {
  describeProblem,
  describeRejectionReason,
  formatAmount,
} from './consumer-api-view.message-mapper.ts';

describe('formatAmount', () => {
  it.each([
    ['4500', 'BRL', 'R$45.00'],
    ['5', 'BRL', 'R$0.05'],
    ['0', 'USD', '$0.00'],
    ['123456789', 'BRL', 'R$1,234,567.89'],
  ])('formats %s cents of %s as %s', (amountInCents, currency, expected) => {
    expect(formatAmount(amountInCents, currency)).toBe(expected);
  });
});

describe('describeRejectionReason', () => {
  it.each([
    ['PAYMENT_DECLINED', 'The card was declined. (PAYMENT_DECLINED)'],
    ['CONSUMER_NOT_FOUND', 'Register your profile before ordering. (CONSUMER_NOT_FOUND)'],
    ['TICKET_REFUSED', 'The restaurant refused the order. (TICKET_REFUSED)'],
    ['SOMETHING_NEW', 'The order was rejected. (SOMETHING_NEW)'],
  ])('describes %s', (rejectionReason, expected) => {
    expect(describeRejectionReason(rejectionReason)).toBe(expected);
  });
});

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
