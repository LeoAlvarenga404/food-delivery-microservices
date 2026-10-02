import { parseEnvironment } from '@fd/chassis-config';
import type { LogLevel } from '@fd/chassis-observability';
import { z } from 'zod';

export interface ConsumerServiceConfiguration {
  readonly databaseUrl: string;
  readonly kafkaBootstrapServers: readonly string[];
  readonly logLevel: LogLevel;
}

const consumerServiceEnvironmentSchema = z.object({
  CONSUMER_DATABASE_URL: z.string().regex(/^postgres(?:ql)?:\/\//),
  KAFKA_BOOTSTRAP_SERVERS: z
    .string()
    .transform((servers) =>
      servers
        .split(',')
        .map((server) => server.trim())
        .filter((server) => server.length > 0),
    )
    .pipe(z.array(z.string()).min(1)),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']).default('info'),
});

export function readConsumerServiceConfiguration(
  environment: NodeJS.ProcessEnv,
): ConsumerServiceConfiguration {
  const variables = parseEnvironment(consumerServiceEnvironmentSchema, environment);
  return {
    databaseUrl: variables.CONSUMER_DATABASE_URL,
    kafkaBootstrapServers: variables.KAFKA_BOOTSTRAP_SERVERS,
    logLevel: variables.LOG_LEVEL,
  };
}
