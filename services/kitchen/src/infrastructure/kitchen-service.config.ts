import { environmentVariables, parseEnvironment } from '@fd/chassis-config';
import type { LogLevel } from '@fd/chassis-observability';
import { z } from 'zod';

export interface KitchenServiceConfiguration {
  readonly databaseUrl: string;
  readonly kafkaBootstrapServers: readonly string[];
  readonly host: string;
  readonly port: number;
  readonly logLevel: LogLevel;
  readonly housekeepingIntervalInMilliseconds: number;
}

const kitchenServiceEnvironmentSchema = z.object({
  KITCHEN_DATABASE_URL: environmentVariables.postgresUrl,
  KAFKA_BOOTSTRAP_SERVERS: environmentVariables.kafkaBootstrapServers,
  KITCHEN_SERVICE_HOST: environmentVariables.listenHost,
  KITCHEN_SERVICE_PORT: environmentVariables.listenPort.default(4003),
  LOG_LEVEL: environmentVariables.logLevel,
  HOUSEKEEPING_INTERVAL_IN_MILLISECONDS:
    environmentVariables.durationInMilliseconds.default(3_600_000),
});

export function readKitchenServiceConfiguration(
  environment: NodeJS.ProcessEnv,
): KitchenServiceConfiguration {
  const variables = parseEnvironment(kitchenServiceEnvironmentSchema, environment);
  return {
    databaseUrl: variables.KITCHEN_DATABASE_URL,
    kafkaBootstrapServers: variables.KAFKA_BOOTSTRAP_SERVERS,
    host: variables.KITCHEN_SERVICE_HOST,
    port: variables.KITCHEN_SERVICE_PORT,
    logLevel: variables.LOG_LEVEL,
    housekeepingIntervalInMilliseconds: variables.HOUSEKEEPING_INTERVAL_IN_MILLISECONDS,
  };
}
