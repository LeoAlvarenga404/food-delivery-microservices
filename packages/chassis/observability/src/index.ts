export { activeTraceparent, annotateActiveSpan, recordActiveSpanFailure } from './active-span.ts';
export { createLogger, withCorrelation } from './logger.ts';
export type { CorrelationFields, LoggerSettings, LogLevel } from './logger.ts';
export { runInClientSpan, runInConsumerSpan, runInRootSpan, runInSpan } from './run-in-span.ts';
export type { ConsumerSpanSettings } from './run-in-span.ts';
export type { Logger } from 'pino';
