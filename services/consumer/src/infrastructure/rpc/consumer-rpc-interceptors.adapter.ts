import type { Interceptor } from '@connectrpc/connect';
import { createAccessTokenInterceptor, createAccessTokenVerifier } from '@fd/chassis-auth';
import type { Logger } from '@fd/chassis-observability';
import { v7 as generateUuidV7 } from 'uuid';
import type { ConsumerServiceConfiguration } from '#infrastructure/consumer-service.config.ts';
import { createRpcCorrelation } from './rpc-correlation.adapter.ts';

const consumerServiceAudience = 'consumer-service';

export function createConsumerRpcInterceptors(
  configuration: ConsumerServiceConfiguration,
  logger: Logger,
): Interceptor[] {
  const verifier = createAccessTokenVerifier({
    issuer: configuration.accessTokenIssuer,
    audience: consumerServiceAudience,
    jwksUrl: configuration.accessTokenJwksUrl,
  });
  return [
    createRpcCorrelation({ logger, generateCorrelationId: generateUuidV7 }),
    createAccessTokenInterceptor(verifier),
  ];
}
