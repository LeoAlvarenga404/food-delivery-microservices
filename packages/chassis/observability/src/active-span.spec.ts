import { recordSpans } from '@fd/chassis-testing';
import { SpanStatusCode } from '@opentelemetry/api';
import { beforeEach, describe, expect, it } from 'vitest';
import { activeTraceparent, annotateActiveSpan, recordActiveSpanFailure } from './active-span.ts';
import { runInRootSpan } from './run-in-span.ts';

const spans = recordSpans();

beforeEach(() => {
  spans.reset();
});

describe('activeTraceparent', () => {
  it('gives the W3C traceparent of the active span', async () => {
    const traceparent = await runInRootSpan('placing', () => Promise.resolve(activeTraceparent()));

    const placing = spans.finishedSpans()[0]?.spanContext();
    expect(traceparent).toBe(`00-${String(placing?.traceId)}-${String(placing?.spanId)}-01`);
  });

  it('gives nothing outside a span', () => {
    expect(activeTraceparent()).toBeUndefined();
  });
});

describe('annotateActiveSpan', () => {
  it('adds the order and saga ids to the active span', async () => {
    await runInRootSpan('timing out', () => {
      annotateActiveSpan({
        orderId: '0199a5d0-0000-7000-8000-0000000000a1',
        sagaId: '0199a5d0-0000-7000-8000-0000000000b1',
      });
      return Promise.resolve();
    });

    expect(spans.finishedSpans()[0]?.attributes).toEqual({
      'fooddelivery.order.id': '0199a5d0-0000-7000-8000-0000000000a1',
      'fooddelivery.saga.id': '0199a5d0-0000-7000-8000-0000000000b1',
    });
  });

  it('leaves out the identifiers it is not given', async () => {
    await runInRootSpan('replying', () => {
      annotateActiveSpan({ sagaId: '0199a5d0-0000-7000-8000-0000000000b1' });
      return Promise.resolve();
    });

    expect(spans.finishedSpans()[0]?.attributes).toEqual({
      'fooddelivery.saga.id': '0199a5d0-0000-7000-8000-0000000000b1',
    });
  });

  it('does nothing outside a span', () => {
    expect(() => {
      annotateActiveSpan({ orderId: '0199a5d0-0000-7000-8000-0000000000a1' });
    }).not.toThrow();
  });
});

describe('recordActiveSpanFailure', () => {
  it('marks the active span as failed with the exception', async () => {
    await runInRootSpan('handling', () => {
      recordActiveSpanFailure(new Error('database went away'));
      return Promise.resolve();
    });

    const [handling] = spans.finishedSpans();
    expect(handling?.status.code).toBe(SpanStatusCode.ERROR);
    expect(handling?.events.map((event) => event.attributes?.['exception.message'])).toEqual([
      'database went away',
    ]);
  });
});
