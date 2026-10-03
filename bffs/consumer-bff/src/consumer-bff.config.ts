import { environmentVariables, parseEnvironment } from '@fd/chassis-config';
import type { LogLevel } from '@fd/chassis-observability';
import { z } from 'zod';

export interface ConsumerBffConfiguration {
  readonly orderServiceUrl: string;
  readonly orderServiceTimeoutInMilliseconds: number;
  readonly accessTokenIssuer: string;
  readonly accessTokenJwksUrl: string;
  readonly tokenExchangeUrl: string;
  readonly clientSecret: string;
  readonly host: string;
  readonly port: number;
  readonly logLevel: LogLevel;
}

const consumerBffEnvironmentSchema = z.object({
  ORDER_SERVICE_URL: environmentVariables.httpUrl,
  ORDER_SERVICE_TIMEOUT_IN_MILLISECONDS: z.coerce
    .number()
    .int()
    .min(1)
    .max(2_147_483_647)
    .default(5000),
  ACCESS_TOKEN_ISSUER: environmentVariables.httpUrl,
  ACCESS_TOKEN_JWKS_URL: environmentVariables.httpUrl,
  TOKEN_EXCHANGE_URL: environmentVariables.httpUrl,
  CONSUMER_BFF_CLIENT_SECRET: z.string().min(1),
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
    accessTokenIssuer: variables.ACCESS_TOKEN_ISSUER,
    accessTokenJwksUrl: variables.ACCESS_TOKEN_JWKS_URL,
    tokenExchangeUrl: variables.TOKEN_EXCHANGE_URL,
    clientSecret: variables.CONSUMER_BFF_CLIENT_SECRET,
    host: variables.CONSUMER_BFF_HOST,
    port: variables.CONSUMER_BFF_PORT,
    logLevel: variables.LOG_LEVEL,
  };
}
