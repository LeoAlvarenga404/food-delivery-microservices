const rejectionReasonDescriptions = new Map([
  ['CONSUMER_NOT_FOUND', 'Register your profile before ordering.'],
  ['CONSUMER_BLOCKED', 'Your account cannot place orders.'],
  ['TICKET_REFUSED', 'The restaurant refused the order.'],
  ['PAYMENT_DECLINED', 'The card was declined.'],
  ['CONSUMER_VERIFICATION_TIMED_OUT', 'Your account could not be checked in time.'],
  ['TICKET_CREATION_TIMED_OUT', 'The restaurant did not answer in time.'],
  ['PAYMENT_AUTHORIZATION_TIMED_OUT', 'The payment was not authorized in time.'],
]);

const refusalDescriptions = new Map([
  ['RestaurantClosed', 'The restaurant is closed now.'],
  ['MinimumOrderNotReached', 'The order is below the minimum of the restaurant.'],
  ['UnavailableMenuItem', 'An item of the cart is no longer available.'],
  [
    'IdempotencyKeyReused',
    'This cart was already ordered with other details. Empty the cart to order again.',
  ],
  ['ConsumerAlreadyRegistered', 'You are already registered.'],
  ['InvalidSearchCriteria', 'The search is not valid.'],
]);

const centsPerUnit = 100;

export function formatAmount(amountInCents: string, currency: string): string {
  const amount = Number(amountInCents) / centsPerUnit;
  return new Intl.NumberFormat('en-US', { style: 'currency', currency }).format(amount);
}

export function describeRejectionReason(rejectionReason: string): string {
  return `${rejectionReasonDescriptions.get(rejectionReason) ?? 'The order was rejected.'} (${rejectionReason})`;
}

export function describeProblem(status: number, reason: string | undefined): string {
  const refusal = reason === undefined ? undefined : refusalDescriptions.get(reason);
  if (refusal !== undefined) return refusal;
  if (status === 400) return 'Some fields are not valid. Check them and try again.';
  if (status === 503 || status === 504) return 'The service is busy. Try again in a moment.';
  return `Something went wrong (HTTP ${String(status)}).`;
}
