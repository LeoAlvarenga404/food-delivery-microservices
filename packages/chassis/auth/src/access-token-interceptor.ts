import { Code, ConnectError, createContextKey, type Interceptor } from '@connectrpc/connect';
import type { AccessTokenVerifier, VerifiedAccessToken } from './access-token-verifier.ts';
import { readBearerToken } from './bearer-token.ts';

export const verifiedAccessTokenKey = createContextKey<VerifiedAccessToken | undefined>(undefined, {
  description: 'access token verified for the current rpc call',
});

export function createAccessTokenInterceptor(verify: AccessTokenVerifier): Interceptor {
  return (next) => async (request) => {
    const accessToken = readBearerToken(request.header.get('authorization'));
    if (accessToken === undefined) {
      throw new ConnectError('missing bearer access token', Code.Unauthenticated);
    }
    const verified = await verify(accessToken);
    if (verified.isLeft()) throw new ConnectError(verified.failure.reason, Code.Unauthenticated);
    request.contextValues.set(verifiedAccessTokenKey, verified.success);
    return next(request);
  };
}
