import { readTracingSettings, startTracing } from './start-tracing.ts';

startTracing(readTracingSettings(process.env));
