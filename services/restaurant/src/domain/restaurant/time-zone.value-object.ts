import { left, right, type Brand, type Either } from '@fd/domain';

export type TimeZone = Brand<string, 'TimeZone'>;

export interface InvalidTimeZone {
  readonly type: 'InvalidTimeZone';
}

const ianaTimeZones: ReadonlySet<string> = new Set([...Intl.supportedValuesOf('timeZone'), 'UTC']);

function canonicalNameOf(rawTimeZone: string): string | undefined {
  try {
    return new Intl.DateTimeFormat('en-US', { timeZone: rawTimeZone }).resolvedOptions().timeZone;
  } catch {
    return undefined;
  }
}

export function parseTimeZone(rawTimeZone: string): Either<InvalidTimeZone, TimeZone> {
  const canonicalName = canonicalNameOf(rawTimeZone.trim());
  if (canonicalName === undefined || !ianaTimeZones.has(canonicalName)) {
    return left({ type: 'InvalidTimeZone' });
  }
  return right(canonicalName as TimeZone);
}
