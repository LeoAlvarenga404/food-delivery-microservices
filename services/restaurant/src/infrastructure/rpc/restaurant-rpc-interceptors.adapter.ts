import type { Interceptor } from '@connectrpc/connect';
import { createAccessTokenInterceptor, createAccessTokenVerifier } from '@fd/chassis-auth';
import type { Logger } from '@fd/chassis-observability';
import { createRpcCorrelation } from '@fd/chassis-rpc';
import { v7 as generateUuidV7 } from 'uuid';
import type { RestaurantServiceConfiguration } from '#infrastructure/restaurant-service.config.ts';

const restaurantServiceAudience = 'restaurant-service';

export function createRestaurantRpcInterceptors(
  configuration: RestaurantServiceConfiguration,
  logger: Logger,
): Interceptor[] {
  const verifier = createAccessTokenVerifier({
    issuer: configuration.accessTokenIssuer,
    audience: restaurantServiceAudience,
    jwksUrl: configuration.accessTokenJwksUrl,
  });
  return [
    createRpcCorrelation({ logger, generateCorrelationId: generateUuidV7 }),
    createAccessTokenInterceptor(verifier),
  ];
}
