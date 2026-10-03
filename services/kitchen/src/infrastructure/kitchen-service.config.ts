import { parseEnvironment } from '@fd/chassis-config';
import type { LogLevel } from '@fd/chassis-observability';
import { z } from 'zod';

export interface KitchenServiceConfiguration {
  readonly databaseUrl: string;
  readonly kafkaBootstrapServers: readonly string[];
  readonly logLevel: LogLevel;
}

const kitchenServiceEnvironmentSchema = z.object({
  KITCHEN_DATABASE_URL: z.string().regex(/^postgres(?:ql)?:\/\//),
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

export function readKitchenServiceConfiguration(
  environment: NodeJS.ProcessEnv,
): KitchenServiceConfiguration {
  const variables = parseEnvironment(kitchenServiceEnvironmentSchema, environment);
  return {
    databaseUrl: variables.KITCHEN_DATABASE_URL,
    kafkaBootstrapServers: variables.KAFKA_BOOTSTRAP_SERVERS,
    logLevel: variables.LOG_LEVEL,
  };
}
