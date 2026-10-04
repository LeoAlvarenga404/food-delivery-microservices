import { Code, ConnectError, type HandlerContext } from '@connectrpc/connect';
import { verifiedAccessTokenKey, type VerifiedAccessToken } from '@fd/chassis-auth';
import type { Either } from '@fd/domain';

export interface PrincipalRefusal {
  readonly type: string;
}

export type PrincipalParser<Principal> = (
  verifiedAccessToken: VerifiedAccessToken,
) => Either<PrincipalRefusal, Principal>;

export function principalOf<Principal>(
  context: HandlerContext,
  parsePrincipal: PrincipalParser<Principal>,
): Principal {
  const verifiedAccessToken = context.values.get(verifiedAccessTokenKey);
  if (verifiedAccessToken === undefined) {
    throw new ConnectError('missing verified access token', Code.Unauthenticated);
  }
  const principal = parsePrincipal(verifiedAccessToken);
  if (principal.isLeft()) throw new ConnectError(principal.failure.type, Code.PermissionDenied);
  return principal.success;
}
