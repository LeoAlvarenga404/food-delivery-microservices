import { environmentVariables, parseEnvironment } from '@fd/chassis-config';
import type { LogLevel } from '@fd/chassis-observability';
import { z } from 'zod';

export interface ConsumerServiceConfiguration {
  readonly databaseUrl: string;
  readonly kafkaBootstrapServers: readonly string[];
  readonly host: string;
  readonly port: number;
  readonly logLevel: LogLevel;
}

const consumerServiceEnvironmentSchema = z.object({
  CONSUMER_DATABASE_URL: environmentVariables.postgresUrl,
  KAFKA_BOOTSTRAP_SERVERS: environmentVariables.kafkaBootstrapServers,
  CONSUMER_SERVICE_HOST: environmentVariables.listenHost,
  CONSUMER_SERVICE_PORT: environmentVariables.listenPort.default(4002),
  LOG_LEVEL: environmentVariables.logLevel,
});

export function readConsumerServiceConfiguration(
  environment: NodeJS.ProcessEnv,
): ConsumerServiceConfiguration {
  const variables = parseEnvironment(consumerServiceEnvironmentSchema, environment);
  return {
    databaseUrl: variables.CONSUMER_DATABASE_URL,
    kafkaBootstrapServers: variables.KAFKA_BOOTSTRAP_SERVERS,
    host: variables.CONSUMER_SERVICE_HOST,
    port: variables.CONSUMER_SERVICE_PORT,
    logLevel: variables.LOG_LEVEL,
  };
}
