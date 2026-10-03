import {
  context,
  propagation,
  ROOT_CONTEXT,
  SpanKind,
  trace,
  type Attributes,
  type Context,
  type Span,
  type SpanOptions,
} from '@opentelemetry/api';
import { recordSpanFailure } from './active-span.ts';

export interface SpanSettings {
  readonly name: string;
  readonly attributes: Attributes;
}

export interface ConsumerSpanSettings extends SpanSettings {
  readonly traceparent: string | undefined;
}

interface SpanStart {
  readonly name: string;
  readonly parent: Context;
  readonly options: SpanOptions;
}

const tracer = trace.getTracer('@fd/chassis-observability');

async function finishAfter<Result>(span: Span, work: () => Promise<Result>): Promise<Result> {
  try {
    return await work();
  } catch (error) {
    recordSpanFailure(span, error);
    throw error;
  } finally {
    span.end();
  }
}

function runInStartedSpan<Result>(start: SpanStart, work: () => Promise<Result>): Promise<Result> {
  return tracer.startActiveSpan(start.name, start.options, start.parent, (span) =>
    finishAfter(span, work),
  );
}

export function runInSpan<Result>(name: string, work: () => Promise<Result>): Promise<Result> {
  return runInStartedSpan({ name, parent: context.active(), options: {} }, work);
}

export function runInRootSpan<Result>(name: string, work: () => Promise<Result>): Promise<Result> {
  return runInStartedSpan({ name, parent: ROOT_CONTEXT, options: {} }, work);
}

export function runInClientSpan<Result>(
  settings: SpanSettings,
  work: () => Promise<Result>,
): Promise<Result> {
  const options = { kind: SpanKind.CLIENT, attributes: settings.attributes };
  return runInStartedSpan({ name: settings.name, parent: context.active(), options }, work);
}

export function runInConsumerSpan<Result>(
  settings: ConsumerSpanSettings,
  work: () => Promise<Result>,
): Promise<Result> {
  const carrier = settings.traceparent === undefined ? {} : { traceparent: settings.traceparent };
  const parent = propagation.extract(ROOT_CONTEXT, carrier);
  const options = { kind: SpanKind.CONSUMER, attributes: settings.attributes };
  return runInStartedSpan({ name: settings.name, parent, options }, work);
}
