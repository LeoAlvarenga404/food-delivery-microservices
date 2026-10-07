import { Writable } from 'node:stream';
import { recordSpans } from '@fd/chassis-testing';
import { describe, expect, it } from 'vitest';
import { createLogger, withCorrelation } from './logger.ts';
import { runInRootSpan } from './run-in-span.ts';

type LogEntry = Readonly<Record<string, unknown>>;

const spans = recordSpans();

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

  it('adds the trace and span ids of the active span to the entries written inside it', async () => {
    const { destination, entries } = captureEntries();
    const logger = createLogger({ serviceName: 'kitchen-service', level: 'info' }, destination);

    await runInRootSpan('creating ticket', () => {
      logger.child({ orderId: 'order-1' }).info('ticket created');
      return Promise.resolve();
    });
    logger.info('idle');

    expect(spans.finishedSpans()).toHaveLength(1);
    const creatingTicket = spans.finishedSpans()[0]?.spanContext();
    expect(entries[0]?.['trace_id']).toBe(creatingTicket?.traceId);
    expect(entries[0]?.['span_id']).toBe(creatingTicket?.spanId);
    expect(entries[1]).not.toHaveProperty('trace_id');
    expect(entries[1]).not.toHaveProperty('span_id');
  });

  it('redacts credentials at the top level and one level deep', () => {
    const { destination, entries } = captureEntries();
    const logger = createLogger({ serviceName: 'consumer-bff', level: 'info' }, destination);

    logger.info(
      {
        authorization: 'Bearer header.payload.signature',
        password: 'consumer-a-password',
        request: { method: 'POST', headers: { authorization: 'Bearer header.payload.signature' } },
        configuration: {
          databaseUrl: 'postgresql://order-db:5432/order_service',
          connectionString: 'postgresql://order-db:5432/order_service',
          clientSecret: 'local-consumer-bff-secret',
          accessToken: 'header.payload.signature',
          host: '0.0.0.0',
        },
      },
      'credentials around',
    );

    expect(entries[0]).toMatchObject({
      authorization: '[redacted]',
      password: '[redacted]',
      request: { method: 'POST', headers: { authorization: '[redacted]' } },
      configuration: {
        databaseUrl: '[redacted]',
        connectionString: '[redacted]',
        clientSecret: '[redacted]',
        accessToken: '[redacted]',
        host: '0.0.0.0',
      },
    });
  });
});

describe('createLogger redaction', () => {
  it.each([
    'authorization',
    'password',
    'clientSecret',
    'accessToken',
    'connectionString',
    'databaseUrl',
    'access_token',
    'client_secret',
    'subject_token',
    'subjectToken',
  ])('redacts %s at the top level and under any parent', (field) => {
    const { destination, entries } = captureEntries();
    const logger = createLogger({ serviceName: 'consumer-bff', level: 'info' }, destination);

    logger.info(
      {
        [field]: 'credential',
        request: { [field]: 'credential' },
        response: { [field]: 'credential' },
      },
      'credential around',
    );

    expect(entries[0]).toMatchObject({
      [field]: '[redacted]',
      request: { [field]: '[redacted]' },
      response: { [field]: '[redacted]' },
    });
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
