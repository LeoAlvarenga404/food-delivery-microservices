import { left, right, type Either } from '@fd/domain';
import { createRemoteJWKSet, errors, jwtVerify, type JWTPayload } from 'jose';
import { z } from 'zod';

export interface AccessTokenVerifierSettings {
  readonly issuer: string;
  readonly audience: string;
  readonly jwksUrl: string;
  readonly now?: () => Date;
}

export interface VerifiedAccessToken {
  readonly subject: string;
  readonly roles: readonly string[];
}

export interface InvalidAccessToken {
  readonly type: 'InvalidAccessToken';
  readonly reason: string;
}

export type AccessTokenVerifier = (
  accessToken: string,
) => Promise<Either<InvalidAccessToken, VerifiedAccessToken>>;

const realmAccessClaim = 'realm_access';
const accessTokenClaimsSchema = z.object({
  sub: z.string().min(1),
  [realmAccessClaim]: z.object({ roles: z.array(z.string()) }).optional(),
});

const tokenFailureCodes: ReadonlySet<string> = new Set([
  'ERR_JWT_EXPIRED',
  'ERR_JWT_CLAIM_VALIDATION_FAILED',
  'ERR_JWT_INVALID',
  'ERR_JWS_INVALID',
  'ERR_JWS_SIGNATURE_VERIFICATION_FAILED',
  'ERR_JWKS_NO_MATCHING_KEY',
  'ERR_JOSE_ALG_NOT_ALLOWED',
  'ERR_JOSE_NOT_SUPPORTED',
]);

function invalidAccessToken(reason: string): Either<InvalidAccessToken, never> {
  return left({ type: 'InvalidAccessToken', reason });
}

function toVerifiedAccessToken(
  payload: JWTPayload,
): Either<InvalidAccessToken, VerifiedAccessToken> {
  const claims = accessTokenClaimsSchema.safeParse(payload);
  if (!claims.success) return invalidAccessToken('ERR_ACCESS_TOKEN_CLAIMS_INVALID');
  return right({ subject: claims.data.sub, roles: claims.data[realmAccessClaim]?.roles ?? [] });
}

export function createAccessTokenVerifier(
  settings: AccessTokenVerifierSettings,
): AccessTokenVerifier {
  const keySet = createRemoteJWKSet(new URL(settings.jwksUrl));
  const now = settings.now ?? (() => new Date());
  const options = { issuer: settings.issuer, audience: settings.audience, algorithms: ['RS256'] };
  return async (accessToken) => {
    try {
      const verified = await jwtVerify(accessToken, keySet, { ...options, currentDate: now() });
      return toVerifiedAccessToken(verified.payload);
    } catch (error) {
      if (error instanceof errors.JOSEError && tokenFailureCodes.has(error.code)) {
        return invalidAccessToken(error.code);
      }
      throw error;
    }
  };
}
