import { environmentVariables, parseEnvironment } from '@fd/chassis-config';
import type { LogLevel } from '@fd/chassis-observability';
import { z } from 'zod';

export interface ConsumerServiceConfiguration {
  readonly databaseUrl: string;
  readonly kafkaBootstrapServers: readonly string[];
  readonly logLevel: LogLevel;
}

const consumerServiceEnvironmentSchema = z.object({
  CONSUMER_DATABASE_URL: environmentVariables.postgresUrl,
  KAFKA_BOOTSTRAP_SERVERS: environmentVariables.kafkaBootstrapServers,
  LOG_LEVEL: environmentVariables.logLevel,
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
