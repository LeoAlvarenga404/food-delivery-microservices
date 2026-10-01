import { pino, type DestinationStream, type Logger } from 'pino';

export interface LoggerSettings {
  readonly serviceName: string;
  readonly level: string;
}

export interface CorrelationFields {
  readonly correlationId: string;
  readonly causationId?: string | undefined;
  readonly sagaId?: string | undefined;
  readonly messageId?: string | undefined;
}

export function createLogger(settings: LoggerSettings, destination?: DestinationStream): Logger {
  const options = {
    level: settings.level,
    base: { service: settings.serviceName },
    timestamp: pino.stdTimeFunctions.isoTime,
  };
  return destination === undefined ? pino(options) : pino(options, destination);
}

export function withCorrelation(logger: Logger, fields: CorrelationFields): Logger {
  const presentFields = Object.entries(fields).filter(([, field]) => field !== undefined);
  return logger.child(Object.fromEntries(presentFields));
}
