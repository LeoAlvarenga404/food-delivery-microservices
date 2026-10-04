import { environmentVariables, parseEnvironment } from '@fd/chassis-config';
import type { LogLevel } from '@fd/chassis-observability';
import { z } from 'zod';

export interface RestaurantServiceConfiguration {
  readonly databaseUrl: string;
  readonly host: string;
  readonly port: number;
  readonly logLevel: LogLevel;
  readonly housekeepingIntervalInMilliseconds: number;
  readonly accessTokenIssuer: string;
  readonly accessTokenJwksUrl: string;
}

const restaurantServiceEnvironmentSchema = z.object({
  RESTAURANT_DATABASE_URL: environmentVariables.postgresUrl,
  RESTAURANT_SERVICE_HOST: environmentVariables.listenHost,
  RESTAURANT_SERVICE_PORT: environmentVariables.listenPort.default(4005),
  LOG_LEVEL: environmentVariables.logLevel,
  HOUSEKEEPING_INTERVAL_IN_MILLISECONDS:
    environmentVariables.durationInMilliseconds.default(3_600_000),
  ACCESS_TOKEN_ISSUER: environmentVariables.httpUrl,
  ACCESS_TOKEN_JWKS_URL: environmentVariables.httpUrl,
});

export function readRestaurantServiceConfiguration(
  environment: NodeJS.ProcessEnv,
): RestaurantServiceConfiguration {
  const variables = parseEnvironment(restaurantServiceEnvironmentSchema, environment);
  return {
    databaseUrl: variables.RESTAURANT_DATABASE_URL,
    host: variables.RESTAURANT_SERVICE_HOST,
    port: variables.RESTAURANT_SERVICE_PORT,
    logLevel: variables.LOG_LEVEL,
    housekeepingIntervalInMilliseconds: variables.HOUSEKEEPING_INTERVAL_IN_MILLISECONDS,
    accessTokenIssuer: variables.ACCESS_TOKEN_ISSUER,
    accessTokenJwksUrl: variables.ACCESS_TOKEN_JWKS_URL,
  };
}
