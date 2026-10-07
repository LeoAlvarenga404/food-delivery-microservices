const refusalDescriptions = new Map([
  ['InvalidRestaurantName', 'Check the name.'],
  ['InvalidRestaurantCategory', 'Check the category.'],
  ['InvalidRestaurantAddress', 'Check the address and its location.'],
  ['InvalidTimeZone', 'Check the time zone.'],
  ['InvalidOpeningPeriod', 'Check the opening hours.'],
  ['InvalidOpeningPeriodCount', 'Open the restaurant on at least one day.'],
  ['InvalidMinimumOrder', 'Check the minimum order.'],
  ['InvalidMenuItem', 'Check the name and the price of every item.'],
  ['InvalidMenuItemCount', 'A menu holds at most 200 items.'],
  ['DuplicateMenuItem', 'Two items share an id. Reload the page.'],
  ['NotRestaurantMember', 'You are not a member of this restaurant.'],
  ['ConcurrentMenuRevision', 'Someone else revised the menu meanwhile. Reload the page to see it.'],
]);

const statusDescriptions = new Map([
  [400, 'Some fields are not valid. Check them and try again.'],
  [401, 'Your session ended. Reload the page to sign in again.'],
  [403, 'Your account may not open this restaurant.'],
  [404, 'This restaurant does not exist.'],
  [503, 'The service is busy. Try again in a moment.'],
  [504, 'The service is busy. Try again in a moment.'],
]);

const centsPerUnit = 100n;

export const amountTextPattern = /^(\d{1,9})(?:\.(\d{1,2}))?$/;

export function describeProblem(status: number, reason: string | undefined): string {
  const refusal = reason === undefined ? undefined : refusalDescriptions.get(reason);
  const fallback =
    statusDescriptions.get(status) ?? `Something went wrong (HTTP ${String(status)}).`;
  return refusal ?? fallback;
}

export function toAmountInCents(amountText: string): string {
  const [, units = '0', fraction = ''] = amountTextPattern.exec(amountText) ?? [];
  return String(BigInt(units) * centsPerUnit + BigInt(fraction.padEnd(2, '0')));
}

export function toAmountText(amountInCents: string): string {
  const cents = BigInt(amountInCents);
  return `${String(cents / centsPerUnit)}.${String(cents % centsPerUnit).padStart(2, '0')}`;
}
