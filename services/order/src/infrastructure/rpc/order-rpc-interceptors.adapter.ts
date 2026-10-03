import type { Interceptor } from '@connectrpc/connect';
import { createAccessTokenInterceptor, createAccessTokenVerifier } from '@fd/chassis-auth';
import type { Logger } from '@fd/chassis-observability';
import { v7 as generateUuidV7 } from 'uuid';
import type { OrderServiceConfiguration } from '#infrastructure/order-service.config.ts';
import { createRpcCorrelation } from './rpc-correlation.adapter.ts';

const orderServiceAudience = 'order-service';

export function createOrderRpcInterceptors(
  configuration: OrderServiceConfiguration,
  logger: Logger,
): Interceptor[] {
  const verifier = createAccessTokenVerifier({
    issuer: configuration.accessTokenIssuer,
    audience: orderServiceAudience,
    jwksUrl: configuration.accessTokenJwksUrl,
  });
  return [
    createRpcCorrelation({ logger, generateCorrelationId: generateUuidV7 }),
    createAccessTokenInterceptor(verifier),
  ];
}
