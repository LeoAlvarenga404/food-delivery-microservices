import type { Interceptor } from '@connectrpc/connect';
import { createAccessTokenInterceptor, createAccessTokenVerifier } from '@fd/chassis-auth';
import type { Logger } from '@fd/chassis-observability';
import { v7 as generateUuidV7 } from 'uuid';
import { createRpcCorrelation } from './rpc-correlation.ts';

export interface AccessTokenIssuerSettings {
  readonly accessTokenIssuer: string;
  readonly accessTokenJwksUrl: string;
}

export function createServiceRpcInterceptors(
  audience: string,
  issuer: AccessTokenIssuerSettings,
  logger: Logger,
): Interceptor[] {
  const verifier = createAccessTokenVerifier({
    issuer: issuer.accessTokenIssuer,
    audience,
    jwksUrl: issuer.accessTokenJwksUrl,
  });
  return [
    createRpcCorrelation({ logger, generateCorrelationId: generateUuidV7 }),
    createAccessTokenInterceptor(verifier),
  ];
}
