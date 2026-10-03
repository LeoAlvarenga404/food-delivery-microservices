import { isSpanContextValid, trace } from '@opentelemetry/api';
import { pino, type DestinationStream, type Logger, type LevelWithSilent } from 'pino';

export type LogLevel = LevelWithSilent;

export interface LoggerSettings {
  readonly serviceName: string;
  readonly level: LogLevel;
}

export interface CorrelationFields {
  readonly correlationId: string;
  readonly causationId?: string | undefined;
  readonly sagaId?: string | undefined;
  readonly messageId?: string | undefined;
}

const traceIdField = 'trace_id';
const spanIdField = 'span_id';

function activeTraceFields(): Readonly<Record<string, string>> {
  const spanContext = trace.getActiveSpan()?.spanContext();
  if (spanContext === undefined || !isSpanContextValid(spanContext)) return {};
  return { [traceIdField]: spanContext.traceId, [spanIdField]: spanContext.spanId };
}

export function createLogger(settings: LoggerSettings, destination?: DestinationStream): Logger {
  const options = {
    level: settings.level,
    base: { service: settings.serviceName },
    timestamp: pino.stdTimeFunctions.isoTime,
    mixin: activeTraceFields,
  };
  return destination === undefined ? pino(options) : pino(options, destination);
}

export function withCorrelation(logger: Logger, fields: CorrelationFields): Logger {
  const presentFields = Object.entries(fields).filter(([, field]) => field !== undefined);
  return logger.child(Object.fromEntries(presentFields));
}
