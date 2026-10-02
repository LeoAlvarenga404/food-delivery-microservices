import { parseEnvironment } from '@fd/chassis-config';
import type { LogLevel } from '@fd/chassis-observability';
import { z } from 'zod';

export interface OrderServiceConfiguration {
  readonly databaseUrl: string;
  readonly kafkaBootstrapServers: readonly string[];
  readonly host: string;
  readonly port: number;
  readonly logLevel: LogLevel;
}

const orderServiceEnvironmentSchema = z.object({
  ORDER_DATABASE_URL: z.string().startsWith('postgres://'),
  KAFKA_BOOTSTRAP_SERVERS: z
    .string()
    .min(1)
    .transform((servers) => servers.split(',')),
  ORDER_SERVICE_HOST: z.string().min(1).default('127.0.0.1'),
  ORDER_SERVICE_PORT: z.coerce.number().int().min(0).max(65_535).default(4001),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']).default('info'),
});

export function readOrderServiceConfiguration(
  environment: NodeJS.ProcessEnv,
): OrderServiceConfiguration {
  const variables = parseEnvironment(orderServiceEnvironmentSchema, environment);
  return {
    databaseUrl: variables.ORDER_DATABASE_URL,
    kafkaBootstrapServers: variables.KAFKA_BOOTSTRAP_SERVERS,
    host: variables.ORDER_SERVICE_HOST,
    port: variables.ORDER_SERVICE_PORT,
    logLevel: variables.LOG_LEVEL,
  };
}
