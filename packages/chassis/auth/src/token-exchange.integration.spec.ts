import { startKeycloakContainer, type StartedKeycloak } from '@fd/chassis-testing';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createAccessTokenVerifier } from './access-token-verifier.ts';
import { createTokenExchange, type TokenExchange } from './token-exchange.ts';

const consumerId = '0199a5d0-0000-7000-8000-0000000000c1';
const exchangedTokenLifespanInMilliseconds = 300_000;

let keycloak: StartedKeycloak;

function consumerBffExchange(now?: () => Date): TokenExchange {
  return createTokenExchange({
    tokenUrl: keycloak.tokenUrl,
    clientId: 'consumer-bff',
    clientSecret: keycloak.consumerBffClientSecret,
    ...(now === undefined ? {} : { now }),
  });
}

function exchangedToken(exchanged: Awaited<ReturnType<TokenExchange>>): string {
  if (exchanged.isLeft()) throw new Error(`exchange refused: ${exchanged.failure.error}`);
  return exchanged.success;
}

beforeAll(async () => {
  keycloak = await startKeycloakContainer();
});

afterAll(async () => {
  await keycloak.stop();
});

describe('token exchange against Keycloak', () => {
  it('exchanges a consumer token for a token restricted to the requested audience', async () => {
    const subjectToken = await keycloak.signIn('consumer-a');

    const accessToken = exchangedToken(await consumerBffExchange()(subjectToken, 'order-service'));

    const verifierFor = (audience: string) =>
      createAccessTokenVerifier({ issuer: keycloak.issuer, audience, jwksUrl: keycloak.jwksUrl });
    const forOrderService = await verifierFor('order-service')(accessToken);
    const forConsumerBff = await verifierFor('consumer-bff')(accessToken);
    expect(forOrderService.isRight() && forOrderService.success).toEqual({
      subject: consumerId,
      roles: ['consumer'],
    });
    expect(forConsumerBff.isLeft()).toBe(true);
  });

  it('answers the same subject token and audience from its cache until the exchanged token expires', async () => {
    let nowInMilliseconds = Date.now();
    const exchange = consumerBffExchange(() => new Date(nowInMilliseconds));
    const subjectToken = await keycloak.signIn('consumer-a');

    const first = exchangedToken(await exchange(subjectToken, 'order-service'));
    const cached = exchangedToken(await exchange(subjectToken, 'order-service'));
    nowInMilliseconds += exchangedTokenLifespanInMilliseconds;
    const renewed = exchangedToken(await exchange(subjectToken, 'order-service'));

    expect(cached).toBe(first);
    expect(renewed).not.toBe(first);
  });

  it('exchanges each subject token on its own', async () => {
    const exchange = consumerBffExchange();

    const forConsumerA = exchangedToken(
      await exchange(await keycloak.signIn('consumer-a'), 'order-service'),
    );
    const forConsumerB = exchangedToken(
      await exchange(await keycloak.signIn('consumer-b'), 'order-service'),
    );

    expect(forConsumerB).not.toBe(forConsumerA);
  });

  it('refuses an audience the client may not request', async () => {
    const subjectToken = await keycloak.signIn('consumer-a');

    const exchanged = await consumerBffExchange()(subjectToken, 'e2e');

    expect(exchanged.isLeft() && exchanged.failure).toEqual({
      type: 'TokenExchangeRefused',
      error: 'invalid_request',
    });
  });

  it('refuses a subject token that is not a valid token', async () => {
    const exchanged = await consumerBffExchange()('not-a-token', 'order-service');

    expect(exchanged.isLeft() && exchanged.failure.error).toBe('invalid_request');
  });

  it('fails instead of refusing when its own client credentials are wrong', async () => {
    const exchange = createTokenExchange({
      tokenUrl: keycloak.tokenUrl,
      clientId: 'consumer-bff',
      clientSecret: 'wrong-secret',
    });
    const subjectToken = await keycloak.signIn('consumer-a');

    await expect(exchange(subjectToken, 'order-service')).rejects.toThrow(
      'token exchange failed with HTTP 401',
    );
  });
});
