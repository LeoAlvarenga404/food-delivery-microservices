import { environmentVariables, parseEnvironment } from '@fd/chassis-config';
import type { LogLevel } from '@fd/chassis-observability';
import { z } from 'zod';

export interface AccountingServiceConfiguration {
  readonly databaseUrl: string;
  readonly kafkaBootstrapServers: readonly string[];
  readonly slowGatewayResponseInMilliseconds: number;
  readonly logLevel: LogLevel;
}

const accountingServiceEnvironmentSchema = z.object({
  ACCOUNTING_DATABASE_URL: environmentVariables.postgresUrl,
  KAFKA_BOOTSTRAP_SERVERS: environmentVariables.kafkaBootstrapServers,
  SIMULATED_GATEWAY_SLOW_RESPONSE_IN_MILLISECONDS: z
    .string()
    .trim()
    .min(1)
    .default('3000')
    .transform(Number)
    .pipe(z.number().int().min(0).max(2_147_483_647)),
  LOG_LEVEL: environmentVariables.logLevel,
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
