import { environmentVariables, parseEnvironment } from '@fd/chassis-config';
import type { LogLevel } from '@fd/chassis-observability';
import { z } from 'zod';

export interface RestaurantBffConfiguration {
  readonly restaurantServiceUrl: string;
  readonly restaurantServiceTimeoutInMilliseconds: number;
  readonly accessTokenIssuer: string;
  readonly accessTokenJwksUrl: string;
  readonly tokenExchangeUrl: string;
  readonly clientSecret: string;
  readonly host: string;
  readonly port: number;
  readonly logLevel: LogLevel;
}

const restaurantBffEnvironmentSchema = z.object({
  RESTAURANT_SERVICE_URL: environmentVariables.httpUrl,
  RESTAURANT_SERVICE_TIMEOUT_IN_MILLISECONDS: z.coerce
    .number()
    .int()
    .min(1)
    .max(2_147_483_647)
    .default(5000),
  ACCESS_TOKEN_ISSUER: environmentVariables.httpUrl,
  ACCESS_TOKEN_JWKS_URL: environmentVariables.httpUrl,
  TOKEN_EXCHANGE_URL: environmentVariables.httpUrl,
  RESTAURANT_BFF_CLIENT_SECRET: z.string().min(1),
  RESTAURANT_BFF_HOST: environmentVariables.listenHost,
  RESTAURANT_BFF_PORT: environmentVariables.listenPort.default(4006),
  LOG_LEVEL: environmentVariables.logLevel,
});

export function readRestaurantBffConfiguration(
  environment: NodeJS.ProcessEnv,
): RestaurantBffConfiguration {
  const variables = parseEnvironment(restaurantBffEnvironmentSchema, environment);
  return {
    restaurantServiceUrl: variables.RESTAURANT_SERVICE_URL,
    restaurantServiceTimeoutInMilliseconds: variables.RESTAURANT_SERVICE_TIMEOUT_IN_MILLISECONDS,
    accessTokenIssuer: variables.ACCESS_TOKEN_ISSUER,
    accessTokenJwksUrl: variables.ACCESS_TOKEN_JWKS_URL,
    tokenExchangeUrl: variables.TOKEN_EXCHANGE_URL,
    clientSecret: variables.RESTAURANT_BFF_CLIENT_SECRET,
    host: variables.RESTAURANT_BFF_HOST,
    port: variables.RESTAURANT_BFF_PORT,
    logLevel: variables.LOG_LEVEL,
  };
}
