import { setTimeout as delay } from 'node:timers/promises';
import { z } from 'zod';

export interface TraceSpan {
  readonly serviceName: string;
  readonly name: string;
  readonly spanId: string;
  readonly parentSpanId: string | undefined;
  readonly attributes: ReadonlyMap<string, string>;
}

const attributeSchema = z.object({
  key: z.string(),
  value: z.looseObject({ stringValue: z.string().optional() }),
});

const resourceSpansSchema = z.object({
  resource: z.object({ attributes: z.array(attributeSchema) }),
  scopeSpans: z.array(
    z.object({
      spans: z.array(
        z.object({
          name: z.string(),
          spanId: z.string(),
          parentSpanId: z.string().optional(),
          attributes: z.array(attributeSchema).optional(),
        }),
      ),
    }),
  ),
});

const traceResponseSchema = z.object({
  trace: z.object({ resourceSpans: z.array(resourceSpansSchema).optional() }),
});

const pollIntervalInMilliseconds = 1_000;

function toHex(base64Id: string): string {
  return Buffer.from(base64Id, 'base64').toString('hex');
}

function attributeText(attribute: z.infer<typeof attributeSchema>): string {
  return attribute.value.stringValue ?? JSON.stringify(attribute.value);
}

function toTraceSpans(resourceSpans: z.infer<typeof resourceSpansSchema>): TraceSpan[] {
  const serviceName = resourceSpans.resource.attributes.find(
    (attribute) => attribute.key === 'service.name',
  )?.value.stringValue;
  return resourceSpans.scopeSpans.flatMap((scopeSpans) =>
    scopeSpans.spans.map((span) => ({
      serviceName: serviceName ?? 'unknown',
      name: span.name,
      spanId: toHex(span.spanId),
      parentSpanId: span.parentSpanId === undefined ? undefined : toHex(span.parentSpanId),
      attributes: new Map(
        (span.attributes ?? []).map((attribute) => [attribute.key, attributeText(attribute)]),
      ),
    })),
  );
}

export class HttpTempoApi {
  readonly #baseUrl: string;

  constructor(baseUrl = process.env['E2E_TEMPO_URL'] ?? 'http://127.0.0.1:3200') {
    this.#baseUrl = baseUrl;
  }

  async readTrace(traceId: string): Promise<readonly TraceSpan[]> {
    const response = await fetch(`${this.#baseUrl}/api/v2/traces/${traceId}`).catch(
      () => undefined,
    );
    if (response?.ok !== true) return [];
    const { trace } = traceResponseSchema.parse(await response.json());
    return (trace.resourceSpans ?? []).flatMap(toTraceSpans);
  }

  async waitForTrace(
    traceId: string,
    isComplete: (spans: readonly TraceSpan[]) => boolean,
    limitInMilliseconds = 90_000,
  ): Promise<readonly TraceSpan[]> {
    const deadlineInMilliseconds = Date.now() + limitInMilliseconds;
    let spans: readonly TraceSpan[] = [];
    while (Date.now() < deadlineInMilliseconds) {
      spans = await this.readTrace(traceId);
      if (isComplete(spans)) return spans;
      await delay(pollIntervalInMilliseconds);
    }
    const applications = [...new Set(spans.map((span) => span.serviceName))].join(', ');
    throw new Error(
      `trace ${traceId} was not complete in time; last seen ${String(spans.length)} spans from ${applications}`,
    );
  }
}
