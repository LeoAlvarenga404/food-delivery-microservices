import { FastifyOtelInstrumentation } from '@fastify/otel';
import { parseEnvironment } from '@fd/chassis-config';
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-http';
import { registerInstrumentations } from '@opentelemetry/instrumentation';
import { HttpInstrumentation } from '@opentelemetry/instrumentation-http';
import { PgInstrumentation } from '@opentelemetry/instrumentation-pg';
import { UndiciInstrumentation } from '@opentelemetry/instrumentation-undici';
import { resourceFromAttributes } from '@opentelemetry/resources';
import {
  BatchSpanProcessor,
  NodeTracerProvider,
  type SpanProcessor,
} from '@opentelemetry/sdk-trace-node';
import { z } from 'zod';

export interface TracingSettings {
  readonly serviceName: string;
  readonly exporterUrl: string | undefined;
}

const tracingEnvironmentSchema = z.object({
  OTEL_SERVICE_NAME: z.string().min(1),
  OTEL_EXPORTER_OTLP_ENDPOINT: z.url({ protocol: /^https?$/ }).optional(),
});

const healthPath = '/health';
const exportTimeoutInMilliseconds = 2_000;

export function readTracingSettings(environment: NodeJS.ProcessEnv): TracingSettings {
  const variables = parseEnvironment(tracingEnvironmentSchema, environment);
  return {
    serviceName: variables.OTEL_SERVICE_NAME,
    exporterUrl: variables.OTEL_EXPORTER_OTLP_ENDPOINT,
  };
}

function spanProcessors(exporterUrl: string | undefined): SpanProcessor[] {
  if (exporterUrl === undefined) return [];
  const exporter = new OTLPTraceExporter({
    url: `${exporterUrl.replace(/\/+$/, '')}/v1/traces`,
    timeoutMillis: exportTimeoutInMilliseconds,
    httpAgentOptions: { keepAlive: true, timeout: exportTimeoutInMilliseconds },
  });
  return [new BatchSpanProcessor(exporter)];
}

export function startTracing(settings: TracingSettings): void {
  const provider = new NodeTracerProvider({
    resource: resourceFromAttributes({ 'service.name': settings.serviceName }),
    spanProcessors: spanProcessors(settings.exporterUrl),
  });
  provider.register();
  registerInstrumentations({
    instrumentations: [
      new HttpInstrumentation({
        ignoreIncomingRequestHook: (request) => request.url === healthPath,
      }),
      new FastifyOtelInstrumentation({
        registerOnInitialization: true,
        instrumentHandler: false,
      }),
      new PgInstrumentation({ requireParentSpan: true }),
      new UndiciInstrumentation(),
    ],
  });
  process.once('beforeExit', () => {
    void provider.shutdown().catch(() => undefined);
  });
}
