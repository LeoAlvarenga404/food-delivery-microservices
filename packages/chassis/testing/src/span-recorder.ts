import {
  InMemorySpanExporter,
  NodeTracerProvider,
  SimpleSpanProcessor,
  type ReadableSpan,
} from '@opentelemetry/sdk-trace-node';

export type RecordedSpan = ReadableSpan;

export interface SpanRecorder {
  readonly finishedSpans: () => readonly RecordedSpan[];
  readonly spansNamed: (name: string) => readonly RecordedSpan[];
  readonly reset: () => void;
}

export function recordSpans(): SpanRecorder {
  const exporter = new InMemorySpanExporter();
  new NodeTracerProvider({ spanProcessors: [new SimpleSpanProcessor(exporter)] }).register();
  return {
    finishedSpans: () => exporter.getFinishedSpans(),
    spansNamed: (name) => exporter.getFinishedSpans().filter((span) => span.name === name),
    reset: () => {
      exporter.reset();
    },
  };
}

export function traceparentOf(span: RecordedSpan | undefined): string {
  const spanContext = span?.spanContext();
  return `00-${String(spanContext?.traceId)}-${String(spanContext?.spanId)}-01`;
}
