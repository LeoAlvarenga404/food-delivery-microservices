const refusalDescriptions = new Map([
  ['NotRestaurantMember', 'You are not a member of this restaurant.'],
  ['TicketNotFound', 'This ticket is no longer in the queue.'],
  ['InvalidPreparationTime', 'Enter a preparation time between 1 and 120 minutes.'],
  ['InvalidTicketTransition', 'This ticket has already moved on. The queue shows where it is now.'],
  [
    'ConcurrentTicketChange',
    'Someone else changed this ticket at the same time. The queue shows where it is now.',
  ],
]);

const statusDescriptions = new Map([
  [400, 'Some fields are not valid. Check them and try again.'],
  [401, 'Your session ended. Reload the page to sign in again.'],
  [403, 'Your account may not use this kitchen.'],
  [404, 'This address does not exist.'],
  [503, 'The service is busy. Try again in a moment.'],
  [504, 'The service is busy. Try again in a moment.'],
]);

export function describeProblem(status: number, reason: string | undefined): string {
  const refusal = reason === undefined ? undefined : refusalDescriptions.get(reason);
  const fallback =
    statusDescriptions.get(status) ?? `Something went wrong (HTTP ${String(status)}).`;
  return refusal ?? fallback;
}
