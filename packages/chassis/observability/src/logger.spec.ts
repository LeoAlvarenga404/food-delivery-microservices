import { Writable } from 'node:stream';
import { describe, expect, it } from 'vitest';
import { createLogger, withCorrelation } from './logger.ts';

type LogEntry = Readonly<Record<string, unknown>>;

function parseEntry(line: string): LogEntry {
  const parsed: unknown = JSON.parse(line);
  return typeof parsed === 'object' && parsed !== null
    ? Object.fromEntries(Object.entries(parsed))
    : {};
}

function captureEntries(): { readonly destination: Writable; readonly entries: LogEntry[] } {
  const entries: LogEntry[] = [];
  const destination = new Writable({
    write(chunk: Buffer, encoding, callback) {
      entries.push(parseEntry(chunk.toString()));
      callback();
    },
  });
  return { destination, entries };
}

describe('createLogger', () => {
  it('writes one JSON entry with the service name and an ISO timestamp', () => {
    const { destination, entries } = captureEntries();
    const logger = createLogger({ serviceName: 'order-service', level: 'info' }, destination);

    logger.info({ orderId: 'order-1' }, 'order placed');

    expect(entries).toHaveLength(1);
    expect(entries[0]).toMatchObject({
      level: 30,
      service: 'order-service',
      orderId: 'order-1',
      msg: 'order placed',
    });
    expect(entries[0]?.['time']).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
  });

  it('drops entries below the configured level', () => {
    const { destination, entries } = captureEntries();
    const logger = createLogger({ serviceName: 'order-service', level: 'warn' }, destination);

    logger.info('ignored');
    logger.warn('kept');

    expect(entries).toHaveLength(1);
    expect(entries[0]).toMatchObject({ msg: 'kept' });
  });
});

describe('withCorrelation', () => {
  it('adds the correlation fields that are present to every entry', () => {
    const { destination, entries } = captureEntries();
    const logger = createLogger({ serviceName: 'kitchen-service', level: 'info' }, destination);

    withCorrelation(logger, {
      correlationId: 'correlation-1',
      causationId: undefined,
      sagaId: 'saga-1',
      messageId: 'message-1',
    }).info('ticket created');

    expect(entries[0]).toMatchObject({
      correlationId: 'correlation-1',
      sagaId: 'saga-1',
      messageId: 'message-1',
    });
    expect(entries[0]).not.toHaveProperty('causationId');
  });
});
