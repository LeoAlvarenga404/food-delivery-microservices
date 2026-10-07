import { describe, expect, it } from 'vitest';
import { ExternalDependencyFailure } from './external-dependency-failure.ts';
import { classifyFailure, decideFailureHandling } from './failure-handling.ts';
import { PermanentMessageFailure } from './permanent-message-failure.ts';
import { TransientMessageFailure } from './transient-message-failure.ts';

function errorWithCode(code: string): Error {
  return Object.assign(new Error(`failed with ${code}`), { code });
}

const almostOne = () => 0.999;

describe('classifyFailure', () => {
  it('classifies an undecodable or unknown message as permanent', () => {
    expect(classifyFailure(new PermanentMessageFailure('unknown message-type'))).toBe('permanent');
  });

  it('classifies a failing external dependency as external, even with a network code', () => {
    const gatewayTimeout = Object.assign(new ExternalDependencyFailure('gateway timed out'), {
      code: 'ETIMEDOUT',
    });

    expect(classifyFailure(gatewayTimeout)).toBe('external');
  });

  it('classifies a dependency the handler reports as briefly unavailable as transient', () => {
    expect(classifyFailure(new TransientMessageFailure('search index unavailable'))).toBe(
      'transient',
    );
  });

  it.each([
    'ECONNREFUSED',
    'ECONNRESET',
    'ETIMEDOUT',
    'ENOTFOUND',
    'EHOSTUNREACH',
    '08006',
    '40001',
    '40P01',
    '57P01',
    '53300',
  ])('classifies code %s as transient', (code) => {
    expect(classifyFailure(errorWithCode(code))).toBe('transient');
  });

  it.each([
    { description: 'an error without a code', error: new Error('bug') },
    { description: 'a constraint violation', error: errorWithCode('23505') },
    { description: 'a thrown string', error: 'boom' },
  ])('classifies $description as unknown', ({ error }) => {
    expect(classifyFailure(error)).toBe('unknown');
  });
});

describe('decideFailureHandling', () => {
  it('dead-letters a permanent failure on the first attempt', () => {
    expect(decideFailureHandling('permanent', 1)).toEqual({ kind: 'dead-letter' });
  });

  it.each([1, 2, 3, 4])('retries an unknown failure after attempt %i', (attemptCount) => {
    expect(decideFailureHandling('unknown', attemptCount).kind).toBe('retry');
  });

  it('dead-letters an unknown failure after the fifth attempt', () => {
    expect(decideFailureHandling('unknown', 5)).toEqual({ kind: 'dead-letter' });
  });

  it.each([1, 2, 3, 4])('retries an external failure after attempt %i', (attemptCount) => {
    expect(decideFailureHandling('external', attemptCount).kind).toBe('retry');
  });

  it('dead-letters an external failure after the fifth attempt', () => {
    expect(decideFailureHandling('external', 5)).toEqual({ kind: 'dead-letter' });
  });

  it('keeps retrying a transient failure without limit', () => {
    expect(decideFailureHandling('transient', 1000).kind).toBe('retry');
  });

  it.each([
    [1, 99],
    [2, 199],
    [3, 399],
    [9, 25_574],
    [10, 29_970],
    [1000, 29_970],
  ])(
    'waits a random delay below the capped exponential ceiling at attempt %i',
    (attemptCount, delay) => {
      expect(decideFailureHandling('transient', attemptCount, almostOne)).toEqual({
        kind: 'retry',
        delayInMilliseconds: delay,
      });
    },
  );

  it('can wait no time at all (full jitter)', () => {
    expect(decideFailureHandling('transient', 7, () => 0)).toEqual({
      kind: 'retry',
      delayInMilliseconds: 0,
    });
  });
});
