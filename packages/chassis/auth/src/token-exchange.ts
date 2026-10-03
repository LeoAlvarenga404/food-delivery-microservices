import { left, right, type Either } from '@fd/domain';
import { z } from 'zod';

export interface TokenExchangeSettings {
  readonly tokenUrl: string;
  readonly clientId: string;
  readonly clientSecret: string;
  readonly now?: () => Date;
}

export interface TokenExchangeRefused {
  readonly type: 'TokenExchangeRefused';
  readonly error: string;
}

export type TokenExchange = (
  subjectToken: string,
  audience: string,
) => Promise<Either<TokenExchangeRefused, string>>;

interface CachedAccessToken {
  readonly accessToken: string;
  readonly expiresAtInMilliseconds: number;
}

interface ExchangeRequest {
  readonly subjectToken: string;
  readonly audience: string;
  readonly requestedAtInMilliseconds: number;
}

const accessTokenField = 'access_token';
const expiresInField = 'expires_in';
const exchangedTokenSchema = z.object({
  [accessTokenField]: z.string().min(1),
  [expiresInField]: z.number().int().positive(),
});
const refusalSchema = z.object({ error: z.string() });
const badRequestStatus = 400;
const expiryMarginInMilliseconds = 5_000;

function forgetExpired(cache: Map<string, CachedAccessToken>, nowInMilliseconds: number): void {
  for (const [cacheKey, cached] of cache) {
    if (cached.expiresAtInMilliseconds <= nowInMilliseconds) cache.delete(cacheKey);
  }
}

function postExchange(
  settings: TokenExchangeSettings,
  request: ExchangeRequest,
): Promise<Response> {
  return fetch(settings.tokenUrl, {
    method: 'POST',
    body: new URLSearchParams([
      ['grant_type', 'urn:ietf:params:oauth:grant-type:token-exchange'],
      ['client_id', settings.clientId],
      ['client_secret', settings.clientSecret],
      ['subject_token', request.subjectToken],
      ['subject_token_type', 'urn:ietf:params:oauth:token-type:access_token'],
      ['audience', request.audience],
    ]),
  });
}

async function exchangeAtIssuer(
  settings: TokenExchangeSettings,
  request: ExchangeRequest,
): Promise<Either<TokenExchangeRefused, CachedAccessToken>> {
  const response = await postExchange(settings, request);
  if (response.status === badRequestStatus) {
    const { error } = refusalSchema.parse(await response.json());
    return left({ type: 'TokenExchangeRefused', error });
  }
  if (!response.ok) throw new Error(`token exchange failed with HTTP ${String(response.status)}`);
  const exchanged = exchangedTokenSchema.parse(await response.json());
  const lifetimeInMilliseconds = exchanged[expiresInField] * 1_000 - expiryMarginInMilliseconds;
  return right({
    accessToken: exchanged[accessTokenField],
    expiresAtInMilliseconds: request.requestedAtInMilliseconds + lifetimeInMilliseconds,
  });
}

export function createTokenExchange(settings: TokenExchangeSettings): TokenExchange {
  const cache = new Map<string, CachedAccessToken>();
  const now = settings.now ?? (() => new Date());
  return async (subjectToken, audience) => {
    const cacheKey = `${audience} ${subjectToken}`;
    const requestedAtInMilliseconds = now().getTime();
    const cached = cache.get(cacheKey);
    if (cached !== undefined && cached.expiresAtInMilliseconds > requestedAtInMilliseconds) {
      return right(cached.accessToken);
    }
    forgetExpired(cache, requestedAtInMilliseconds);
    const exchanged = await exchangeAtIssuer(settings, {
      subjectToken,
      audience,
      requestedAtInMilliseconds,
    });
    if (exchanged.isLeft()) return exchanged;
    cache.set(cacheKey, exchanged.success);
    return right(exchanged.success.accessToken);
  };
}
