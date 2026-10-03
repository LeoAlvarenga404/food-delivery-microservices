import { Writable } from 'node:stream';
import { createLogger, runInRootSpan, type Logger } from '@fd/chassis-observability';
import { recordSpans } from '@fd/chassis-testing';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { startPeriodicJob } from './start-periodic-job.ts';

const intervalInMilliseconds = 1_000;
const errorStatusCode = 2;
const spans = recordSpans();

let logEntries: Record<string, unknown>[];

function captureLogger(): Logger {
  logEntries = [];
  const destination = new Writable({
    write(chunk: Buffer, encoding, callback) {
      const parsed: unknown = JSON.parse(chunk.toString());
      logEntries.push(typeof parsed === 'object' && parsed !== null ? { ...parsed } : {});
      callback();
    },
  });
  return createLogger({ serviceName: 'lifecycle-test', level: 'info' }, destination);
}

beforeEach(() => {
  vi.useFakeTimers();
  spans.reset();
});

afterEach(() => {
  vi.useRealTimers();
});

describe('startPeriodicJob', () => {
  it('runs the job once per interval, starting one interval after the start', async () => {
    let runCount = 0;
    const job = startPeriodicJob({
      name: 'counting',
      intervalInMilliseconds,
      run: () => {
        runCount += 1;
        return Promise.resolve();
      },
      logger: captureLogger(),
    });

    await vi.advanceTimersByTimeAsync(intervalInMilliseconds - 1);
    expect(runCount).toBe(0);
    await vi.advanceTimersByTimeAsync(1);
    expect(runCount).toBe(1);
    await vi.advanceTimersByTimeAsync(2 * intervalInMilliseconds);
    expect(runCount).toBe(3);
    await job.stop();
  });

  it('never overlaps runs: the next interval starts when the slow run ends', async () => {
    let runCount = 0;
    const firstRun = Promise.withResolvers<undefined>();
    const job = startPeriodicJob({
      name: 'slow',
      intervalInMilliseconds,
      run: () => {
        runCount += 1;
        return runCount === 1 ? firstRun.promise : Promise.resolve();
      },
      logger: captureLogger(),
    });

    await vi.advanceTimersByTimeAsync(5 * intervalInMilliseconds);
    expect(runCount).toBe(1);
    firstRun.resolve(undefined);
    await vi.advanceTimersByTimeAsync(intervalInMilliseconds);
    expect(runCount).toBe(2);
    await job.stop();
  });

  it('logs a failed run with the job name and keeps running', async () => {
    let runCount = 0;
    const job = startPeriodicJob({
      name: 'flaky',
      intervalInMilliseconds,
      run: () => {
        runCount += 1;
        return runCount === 1 ? Promise.reject(new Error('database down')) : Promise.resolve();
      },
      logger: captureLogger(),
    });

    await vi.advanceTimersByTimeAsync(2 * intervalInMilliseconds);

    expect(runCount).toBe(2);
    expect(logEntries).toMatchObject([
      {
        level: 50,
        jobName: 'flaky',
        msg: 'periodic job failed',
        err: { message: 'database down' },
      },
    ]);
    await job.stop();
  });

  it('runs every run in its own root span named after the job', async () => {
    const job = startPeriodicJob({
      name: 'housekeeping',
      intervalInMilliseconds,
      run: () => Promise.resolve(),
      logger: captureLogger(),
    });

    await runInRootSpan('advancing the clock', () =>
      vi.advanceTimersByTimeAsync(2 * intervalInMilliseconds),
    );
    await job.stop();

    const runs = spans.spansNamed('housekeeping');
    expect(runs.map((run) => run.parentSpanContext)).toEqual([undefined, undefined]);
    expect(runs[0]?.spanContext().traceId).not.toBe(runs[1]?.spanContext().traceId);
  });

  it('marks the span of a failed run as failed and logs the failure with its trace id', async () => {
    const job = startPeriodicJob({
      name: 'failing',
      intervalInMilliseconds,
      run: () => Promise.reject(new Error('database down')),
      logger: captureLogger(),
    });

    await vi.advanceTimersByTimeAsync(intervalInMilliseconds);
    await job.stop();

    const failedRun = spans.spansNamed('failing')[0];
    expect(failedRun?.status.code).toBe(errorStatusCode);
    expect(logEntries[0]?.['trace_id']).toBe(failedRun?.spanContext().traceId);
  });

  it('waits for the run in progress when it stops and never runs again', async () => {
    let runCount = 0;
    const firstRun = Promise.withResolvers<undefined>();
    const job = startPeriodicJob({
      name: 'stopping',
      intervalInMilliseconds,
      run: () => {
        runCount += 1;
        return firstRun.promise;
      },
      logger: captureLogger(),
    });
    await vi.advanceTimersByTimeAsync(intervalInMilliseconds);
    let wasStopped = false;

    const stopping = job.stop().then(() => {
      wasStopped = true;
    });
    await vi.advanceTimersByTimeAsync(0);
    expect(wasStopped).toBe(false);
    firstRun.resolve(undefined);
    await stopping;
    await vi.advanceTimersByTimeAsync(5 * intervalInMilliseconds);

    expect(wasStopped).toBe(true);
    expect(runCount).toBe(1);
  });

  it('never runs a job stopped before its first interval', async () => {
    let runCount = 0;
    const job = startPeriodicJob({
      name: 'never',
      intervalInMilliseconds,
      run: () => {
        runCount += 1;
        return Promise.resolve();
      },
      logger: captureLogger(),
    });

    await job.stop();
    await vi.advanceTimersByTimeAsync(5 * intervalInMilliseconds);

    expect(runCount).toBe(0);
  });
});
