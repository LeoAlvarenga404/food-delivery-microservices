import { environmentVariables, parseEnvironment } from '@fd/chassis-config';
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
  ORDER_DATABASE_URL: environmentVariables.postgresUrl,
  KAFKA_BOOTSTRAP_SERVERS: environmentVariables.kafkaBootstrapServers,
  ORDER_SERVICE_HOST: environmentVariables.listenHost,
  ORDER_SERVICE_PORT: environmentVariables.listenPort.default(4001),
  LOG_LEVEL: environmentVariables.logLevel,
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
