import { ExternalDependencyFailure } from './external-dependency-failure.ts';
import { PermanentMessageFailure } from './permanent-message-failure.ts';
import { TransientMessageFailure } from './transient-message-failure.ts';

export type FailureClass = 'transient' | 'external' | 'permanent' | 'unknown';

export type FailureHandling =
  | { readonly kind: 'retry'; readonly delayInMilliseconds: number }
  | { readonly kind: 'dead-letter' };

const transientErrorCodes = new Set([
  'ECONNREFUSED',
  'ECONNRESET',
  'ETIMEDOUT',
  'EPIPE',
  'EAI_AGAIN',
  'ENOTFOUND',
  'EHOSTUNREACH',
  'ENETUNREACH',
  'ECONNABORTED',
  '40001',
  '40P01',
  '53300',
  '57P01',
  '57P02',
  '57P03',
]);

const connectionExceptionClass = '08';
const maximumDelayInMilliseconds = 30_000;

const baseDelaysInMilliseconds: Readonly<Record<FailureClass, number>> = {
  transient: 100,
  external: 1_000,
  unknown: 100,
  permanent: 100,
};

const attemptLimits: Readonly<Record<FailureClass, number>> = {
  transient: Number.POSITIVE_INFINITY,
  external: 5,
  unknown: 5,
  permanent: 1,
};

function readErrorCode(error: unknown): string | undefined {
  if (typeof error !== 'object' || error === null || !('code' in error)) return undefined;
  return typeof error.code === 'string' ? error.code : undefined;
}

export function classifyFailure(error: unknown): FailureClass {
  if (error instanceof PermanentMessageFailure) return 'permanent';
  if (error instanceof ExternalDependencyFailure) return 'external';
  if (error instanceof TransientMessageFailure) return 'transient';
  const code = readErrorCode(error);
  if (code === undefined) return 'unknown';
  const isTransient = transientErrorCodes.has(code) || code.startsWith(connectionExceptionClass);
  return isTransient ? 'transient' : 'unknown';
}

export function decideFailureHandling(
  failureClass: FailureClass,
  attemptCount: number,
  random: () => number = Math.random,
): FailureHandling {
  if (attemptCount >= attemptLimits[failureClass]) return { kind: 'dead-letter' };
  const exponentialDelayInMilliseconds =
    baseDelaysInMilliseconds[failureClass] * 2 ** (attemptCount - 1);
  const ceilingInMilliseconds = Math.min(
    maximumDelayInMilliseconds,
    exponentialDelayInMilliseconds,
  );
  return { kind: 'retry', delayInMilliseconds: Math.floor(random() * ceilingInMilliseconds) };
}
