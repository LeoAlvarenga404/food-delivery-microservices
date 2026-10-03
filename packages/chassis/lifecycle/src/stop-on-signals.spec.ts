import { Writable } from 'node:stream';
import { setImmediate as nextTurn, setTimeout as delay } from 'node:timers/promises';
import { createLogger, type Logger } from '@fd/chassis-observability';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { stopOnSignals } from './stop-on-signals.ts';

const signals: readonly NodeJS.Signals[] = ['SIGINT', 'SIGTERM'];

let logEntries: Record<string, unknown>[];
let earlierListeners: Map<NodeJS.Signals, readonly NodeJS.SignalsListener[]>;

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
  earlierListeners = new Map(signals.map((signal) => [signal, process.listeners(signal)]));
});

afterEach(() => {
  for (const signal of signals) {
    const earlier = earlierListeners.get(signal) ?? [];
    process
      .listeners(signal)
      .filter((listener) => !earlier.includes(listener))
      .forEach((listener) => process.off(signal, listener));
  }
  process.exitCode = undefined;
});

describe('stopOnSignals', () => {
  it.each<NodeJS.Signals>(['SIGTERM', 'SIGINT'])('stops the service once on %s', async (signal) => {
    let stopCount = 0;
    stopOnSignals(
      {
        stop: () => {
          stopCount += 1;
          return Promise.resolve();
        },
      },
      captureLogger(),
    );

    process.emit(signal);
    process.emit(signal);
    await nextTurn();

    expect(stopCount).toBe(1);
    expect(process.exitCode).toBeUndefined();
  });

  it('stops the service once when a second, different signal arrives during the stop', async () => {
    const listenerCountsBefore = signals.map((signal) => process.listenerCount(signal));
    let stopCount = 0;
    stopOnSignals(
      {
        stop: async () => {
          stopCount += 1;
          await delay(50);
        },
      },
      captureLogger(),
    );

    process.emit('SIGTERM');
    process.emit('SIGINT');
    await delay(100);

    expect(stopCount).toBe(1);
    expect(signals.map((signal) => process.listenerCount(signal))).toEqual(listenerCountsBefore);
  });

  it('logs a failed stop and marks the process as failed', async () => {
    stopOnSignals({ stop: () => Promise.reject(new Error('pool did not close')) }, captureLogger());

    process.emit('SIGTERM');
    await nextTurn();

    expect(logEntries).toMatchObject([
      { level: 50, msg: 'stopping after a signal failed', err: { message: 'pool did not close' } },
    ]);
    expect(process.exitCode).toBe(1);
  });
});
