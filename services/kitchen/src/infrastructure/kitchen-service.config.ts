import { environmentVariables, parseEnvironment } from '@fd/chassis-config';
import type { LogLevel } from '@fd/chassis-observability';
import { z } from 'zod';

export interface KitchenServiceConfiguration {
  readonly databaseUrl: string;
  readonly kafkaBootstrapServers: readonly string[];
  readonly logLevel: LogLevel;
}

const kitchenServiceEnvironmentSchema = z.object({
  KITCHEN_DATABASE_URL: environmentVariables.postgresUrl,
  KAFKA_BOOTSTRAP_SERVERS: environmentVariables.kafkaBootstrapServers,
  LOG_LEVEL: environmentVariables.logLevel,
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
