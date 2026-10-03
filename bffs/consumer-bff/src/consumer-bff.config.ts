import { environmentVariables, parseEnvironment } from '@fd/chassis-config';
import type { LogLevel } from '@fd/chassis-observability';
import { z } from 'zod';

export interface ConsumerBffConfiguration {
  readonly orderServiceUrl: string;
  readonly orderServiceTimeoutInMilliseconds: number;
  readonly host: string;
  readonly port: number;
  readonly logLevel: LogLevel;
}

const consumerBffEnvironmentSchema = z.object({
  ORDER_SERVICE_URL: z.url({ protocol: /^https?$/ }),
  ORDER_SERVICE_TIMEOUT_IN_MILLISECONDS: z.coerce
    .number()
    .int()
    .min(1)
    .max(2_147_483_647)
    .default(5000),
  CONSUMER_BFF_HOST: environmentVariables.listenHost,
  CONSUMER_BFF_PORT: environmentVariables.listenPort.default(4000),
  LOG_LEVEL: environmentVariables.logLevel,
});

export function readConsumerBffConfiguration(
  environment: NodeJS.ProcessEnv,
): ConsumerBffConfiguration {
  const variables = parseEnvironment(consumerBffEnvironmentSchema, environment);
  return {
    orderServiceUrl: variables.ORDER_SERVICE_URL,
    orderServiceTimeoutInMilliseconds: variables.ORDER_SERVICE_TIMEOUT_IN_MILLISECONDS,
    host: variables.CONSUMER_BFF_HOST,
    port: variables.CONSUMER_BFF_PORT,
    logLevel: variables.LOG_LEVEL,
  };
}
