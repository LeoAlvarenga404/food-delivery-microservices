import { execFile } from 'node:child_process';
import { createServer, type Server } from 'node:http';
import { promisify } from 'node:util';
import { afterEach, describe, expect, it } from 'vitest';
import { z } from 'zod';

interface ExportedSpan {
  readonly serviceName: string | undefined;
  readonly name: string;
  readonly kind: number;
  readonly traceId: string;
  readonly spanId: string;
  readonly parentSpanId?: string | undefined;
}

const runFile = promisify(execFile);
const otlpServerSpanKind = 2;
const otlpClientSpanKind = 3;
const maximumExitTimeInMilliseconds = 7_000;
const packageDirectory = new URL('..', import.meta.url);

const exportRequestSchema = z.object({
  resourceSpans: z.array(
    z.object({
      resource: z.object({
        attributes: z.array(
          z.object({ key: z.string(), value: z.object({ stringValue: z.string().optional() }) }),
        ),
      }),
      scopeSpans: z.array(
        z.object({
          spans: z.array(
            z.object({
              name: z.string(),
              kind: z.number(),
              traceId: z.string(),
              spanId: z.string(),
              parentSpanId: z.string().optional(),
            }),
          ),
        }),
      ),
    }),
  ),
});

let receiver: Server | undefined;

function toExportedSpans(body: string): ExportedSpan[] {
  return exportRequestSchema.parse(JSON.parse(body)).resourceSpans.flatMap((resourceSpans) => {
    const serviceName = resourceSpans.resource.attributes.find(
      (attribute) => attribute.key === 'service.name',
    )?.value.stringValue;
    return resourceSpans.scopeSpans.flatMap((scopeSpans) =>
      scopeSpans.spans.map((span) => ({ ...span, serviceName })),
    );
  });
}

async function startReceiver(
  exportedSpans: ExportedSpan[],
  tracesPath = '/v1/traces',
): Promise<string> {
  receiver = createServer((request, response) => {
    let body = '';
    request.on('data', (chunk: Buffer) => (body += chunk.toString()));
    request.on('end', () => {
      if (request.url === tracesPath) exportedSpans.push(...toExportedSpans(body));
      response.writeHead(200, { 'content-type': 'application/json' }).end('{}');
    });
  });
  const listening = receiver;
  await new Promise<void>((resolve) => listening.listen(0, '127.0.0.1', resolve));
  const address = listening.address();
  return `http://127.0.0.1:${String(typeof address === 'object' ? address?.port : 0)}`;
}

function runTracedRequests(exporterVariables: NodeJS.ProcessEnv): Promise<unknown> {
  return runFile(
    process.execPath,
    ['--import', '@fd/chassis-observability/register', 'test/traced-http-requests.ts'],
    {
      cwd: packageDirectory,
      env: { ...process.env, OTEL_SERVICE_NAME: 'traced-requests', ...exporterVariables },
    },
  );
}

async function closedPortUrl(): Promise<string> {
  const url = await startReceiver([]);
  await new Promise((resolve) => receiver?.close(resolve));
  return url;
}

afterEach(() => {
  receiver?.close();
});

describe('the tracing registered through --import', () => {
  it('exports the spans of the instrumented requests below the endpoint path before the process exits', async () => {
    const exportedSpans: ExportedSpan[] = [];
    await runTracedRequests({
      OTEL_EXPORTER_OTLP_ENDPOINT: `${await startReceiver(exportedSpans, '/otlp/v1/traces')}/otlp/`,
    });

    const serverSpans = exportedSpans.filter((span) => span.kind === otlpServerSpanKind);
    const clientSpans = exportedSpans.filter((span) => span.kind === otlpClientSpanKind);
    expect(new Set(exportedSpans.map((span) => span.serviceName))).toEqual(
      new Set(['traced-requests']),
    );
    expect(serverSpans.map((span) => span.name)).toEqual(['GET /orders/:orderId']);
    expect(clientSpans).toHaveLength(2);
    expect(clientSpans.map((span) => span.spanId)).toContain(serverSpans[0]?.parentSpanId);
    expect(clientSpans.map((span) => span.traceId)).toContain(serverSpans[0]?.traceId);
  });

  it('exits cleanly when the collector cannot be reached', async () => {
    const unreachableUrl = await closedPortUrl();
    const startedAtInMilliseconds = Date.now();

    await expect(
      runTracedRequests({ OTEL_EXPORTER_OTLP_ENDPOINT: unreachableUrl }),
    ).resolves.toMatchObject({ stderr: '' });

    expect(Date.now() - startedAtInMilliseconds).toBeLessThan(maximumExitTimeInMilliseconds);
  });

  it('exports nothing when no endpoint is configured', async () => {
    const exportedSpans: ExportedSpan[] = [];
    const receiverUrl = await startReceiver(exportedSpans);

    await runTracedRequests({ OTEL_EXPORTER_OTLP_TRACES_ENDPOINT: `${receiverUrl}/v1/traces` });

    expect(exportedSpans).toEqual([]);
  });
});
