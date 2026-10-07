import { recordSpans } from '@fd/chassis-testing';
import { SpanKind, SpanStatusCode } from '@opentelemetry/api';
import { beforeEach, describe, expect, it } from 'vitest';
import { runInClientSpan, runInConsumerSpan, runInRootSpan, runInSpan } from './run-in-span.ts';

const spans = recordSpans();
const producerTraceId = '4bf92f3577b34da6a3ce929d0e0e4736';
const producerSpanId = '00f067aa0ba902b7';
const consumerSettings = {
  name: 'process kitchen.commands',
  attributes: { 'messaging.system': 'kafka' },
};

beforeEach(() => {
  spans.reset();
});

describe('runInSpan', () => {
  it('runs the work in a child span of the active span and returns its result', async () => {
    const result = await runInRootSpan('outer', () => runInSpan('inner', () => Promise.resolve(7)));

    const [inner, outer] = spans.finishedSpans();
    expect(result).toBe(7);
    expect(inner?.name).toBe('inner');
    expect(inner?.spanContext().traceId).toBe(outer?.spanContext().traceId);
    expect(inner?.parentSpanContext?.spanId).toBe(outer?.spanContext().spanId);
  });

  it('records a failure on the span, ends it and rethrows the failure', async () => {
    const failing = runInSpan('failing', () => Promise.reject(new Error('database went away')));

    await expect(failing).rejects.toThrow('database went away');
    const [failed] = spans.finishedSpans();
    expect(failed?.status.code).toBe(SpanStatusCode.ERROR);
    expect(failed?.events.map((event) => event.attributes?.['exception.message'])).toEqual([
      'database went away',
    ]);
    expect(failed?.events[0]?.attributes?.['exception.type']).toBe('Error');
  });
});

describe('runInRootSpan', () => {
  it('starts a new trace even inside another span', async () => {
    await runInRootSpan('outer', () => runInRootSpan('job', () => Promise.resolve()));

    const [job, outer] = spans.finishedSpans();
    expect(job?.parentSpanContext).toBeUndefined();
    expect(job?.spanContext().traceId).not.toBe(outer?.spanContext().traceId);
  });
});

describe('runInClientSpan', () => {
  it('runs the work in a client span with its attributes, child of the active span', async () => {
    const settings = {
      name: 'OrderService/PlaceOrder',
      attributes: { 'rpc.system': 'connect_rpc' },
    };

    await runInRootSpan('placing', () => runInClientSpan(settings, () => Promise.resolve()));

    const [calling, placing] = spans.finishedSpans();
    expect(calling?.name).toBe('OrderService/PlaceOrder');
    expect(calling?.kind).toBe(SpanKind.CLIENT);
    expect(calling?.attributes).toEqual({ 'rpc.system': 'connect_rpc' });
    expect(calling?.parentSpanContext?.spanId).toBe(placing?.spanContext().spanId);
  });
});

describe('runInConsumerSpan', () => {
  it('continues the trace of the traceparent in a consumer span', async () => {
    const traceparent = `00-${producerTraceId}-${producerSpanId}-01`;

    await runInConsumerSpan({ ...consumerSettings, traceparent }, () => Promise.resolve());

    const [consumed] = spans.finishedSpans();
    expect(consumed?.name).toBe('process kitchen.commands');
    expect(consumed?.kind).toBe(SpanKind.CONSUMER);
    expect(consumed?.spanContext().traceId).toBe(producerTraceId);
    expect(consumed?.parentSpanContext?.spanId).toBe(producerSpanId);
    expect(consumed?.attributes).toEqual({ 'messaging.system': 'kafka' });
  });

  it.each([
    { case: 'without traceparent', traceparent: undefined },
    { case: 'with a malformed traceparent', traceparent: '00-not-a-trace-01' },
  ])('starts a new trace $case', async ({ traceparent }) => {
    await runInRootSpan('outer', () =>
      runInConsumerSpan({ ...consumerSettings, traceparent }, () => Promise.resolve()),
    );

    const [consumed, outer] = spans.finishedSpans();
    expect(consumed?.parentSpanContext).toBeUndefined();
    expect(consumed?.spanContext().traceId).not.toBe(outer?.spanContext().traceId);
  });
});
