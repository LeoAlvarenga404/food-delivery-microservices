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

export function describeProblem(status: number, reason: string | undefined): string {
  const refusal = reason === undefined ? undefined : refusalDescriptions.get(reason);
  if (refusal !== undefined) return refusal;
  if (status === 400) return 'Some fields are not valid. Check them and try again.';
  if (status === 503 || status === 504) return 'The service is busy. Try again in a moment.';
  return `Something went wrong (HTTP ${String(status)}).`;
}
