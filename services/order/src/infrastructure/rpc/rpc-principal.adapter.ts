import { Code, ConnectError, type HandlerContext } from '@connectrpc/connect';
import { verifiedAccessTokenKey } from '@fd/chassis-auth';
import { parsePrincipal, type Principal } from '#domain/identity/principal.value-object.ts';

export function principalOf(context: HandlerContext): Principal {
  const verifiedAccessToken = context.values.get(verifiedAccessTokenKey);
  if (verifiedAccessToken === undefined) {
    throw new ConnectError('missing verified access token', Code.Unauthenticated);
  }
  const principal = parsePrincipal(verifiedAccessToken);
  if (principal.isLeft()) throw new ConnectError(principal.failure.type, Code.PermissionDenied);
  return principal.success;
}
