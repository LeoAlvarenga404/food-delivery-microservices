import { describe, expect, it } from 'vitest';
import { describeProblem } from './restaurant-api-view.message-mapper.ts';

describe('describeProblem', () => {
  it.each([
    [403, 'NotRestaurantMember', 'You are not a member of this restaurant.'],
    [404, 'TicketNotFound', 'This ticket is no longer in the queue.'],
    [400, 'InvalidPreparationTime', 'Enter a preparation time between 1 and 120 minutes.'],
    [
      422,
      'InvalidTicketTransition',
      'This ticket has already moved on. The queue shows where it is now.',
    ],
    [
      409,
      'ConcurrentTicketChange',
      'Someone else changed this ticket at the same time. The queue shows where it is now.',
    ],
  ])('describes a %i refused with %s', (status, reason, expected) => {
    expect(describeProblem(status, reason)).toBe(expected);
  });

  it.each([
    [400, 'Some fields are not valid. Check them and try again.'],
    [401, 'Your session ended. Reload the page to sign in again.'],
    [403, 'Your account may not use this kitchen.'],
    [404, 'This address does not exist.'],
    [503, 'The service is busy. Try again in a moment.'],
    [504, 'The service is busy. Try again in a moment.'],
    [500, 'Something went wrong (HTTP 500).'],
  ])('describes a %i without a known reason by its status', (status, expected) => {
    expect(describeProblem(status, undefined)).toBe(expected);
    expect(describeProblem(status, 'ReasonAddedLater')).toBe(expected);
  });
});
