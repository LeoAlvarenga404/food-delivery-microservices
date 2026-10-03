import { parseEnvironment } from '@fd/chassis-config';
import type { LogLevel } from '@fd/chassis-observability';
import { z } from 'zod';

export interface AccountingServiceConfiguration {
  readonly databaseUrl: string;
  readonly kafkaBootstrapServers: readonly string[];
  readonly slowGatewayResponseInMilliseconds: number;
  readonly logLevel: LogLevel;
}

const accountingServiceEnvironmentSchema = z.object({
  ACCOUNTING_DATABASE_URL: z.string().regex(/^postgres(?:ql)?:\/\//),
  KAFKA_BOOTSTRAP_SERVERS: z
    .string()
    .transform((servers) =>
      servers
        .split(',')
        .map((server) => server.trim())
        .filter((server) => server.length > 0),
    )
    .pipe(z.array(z.string()).min(1)),
  SIMULATED_GATEWAY_SLOW_RESPONSE_IN_MILLISECONDS: z.coerce.number().int().min(0).default(3000),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']).default('info'),
});

export function readAccountingServiceConfiguration(
  environment: NodeJS.ProcessEnv,
): AccountingServiceConfiguration {
  const variables = parseEnvironment(accountingServiceEnvironmentSchema, environment);
  return {
    databaseUrl: variables.ACCOUNTING_DATABASE_URL,
    kafkaBootstrapServers: variables.KAFKA_BOOTSTRAP_SERVERS,
    slowGatewayResponseInMilliseconds: variables.SIMULATED_GATEWAY_SLOW_RESPONSE_IN_MILLISECONDS,
    logLevel: variables.LOG_LEVEL,
  };
}
