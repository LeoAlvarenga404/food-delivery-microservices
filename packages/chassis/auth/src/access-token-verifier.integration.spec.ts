import { startKeycloakContainer, type StartedKeycloak } from '@fd/chassis-testing';
import { decodeJwt, SignJWT } from 'jose';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createAccessTokenVerifier, type AccessTokenVerifier } from './access-token-verifier.ts';

const consumerId = '0199a5d0-0000-7000-8000-0000000000c1';

let keycloak: StartedKeycloak;

function verifierFor(audience: string, now?: () => Date): AccessTokenVerifier {
  return createAccessTokenVerifier({
    issuer: keycloak.issuer,
    audience,
    jwksUrl: keycloak.jwksUrl,
    ...(now === undefined ? {} : { now }),
  });
}

function withAnotherSignature(accessToken: string): string {
  const [header, payload, signature = ''] = accessToken.split('.');
  const otherSignature = `${signature.startsWith('A') ? 'B' : 'A'}${signature.slice(1)}`;
  return [header, payload, otherSignature].join('.');
}

beforeAll(async () => {
  keycloak = await startKeycloakContainer();
});

afterAll(async () => {
  await keycloak.stop();
});

describe('access token verifier against Keycloak', () => {
  it('reads the subject and the realm roles of a token issued for its audience', async () => {
    const accessToken = await keycloak.signIn('consumer-a');

    const verified = await verifierFor('consumer-bff')(accessToken);

    expect(verified.isRight() && verified.success).toEqual({
      subject: consumerId,
      roles: ['consumer'],
    });
  });

  it('refuses a token issued for another audience', async () => {
    const accessToken = await keycloak.signIn('consumer-a');

    const verified = await verifierFor('order-service')(accessToken);

    expect(verified.isLeft() && verified.failure).toEqual({
      type: 'InvalidAccessToken',
      reason: 'ERR_JWT_CLAIM_VALIDATION_FAILED',
    });
  });

  it('refuses a token from another issuer', async () => {
    const accessToken = await keycloak.signIn('consumer-a');
    const verifier = createAccessTokenVerifier({
      issuer: `${keycloak.issuer}-elsewhere`,
      audience: 'consumer-bff',
      jwksUrl: keycloak.jwksUrl,
    });

    const verified = await verifier(accessToken);

    expect(verified.isLeft() && verified.failure.reason).toBe('ERR_JWT_CLAIM_VALIDATION_FAILED');
  });

  it('refuses a token once it has expired', async () => {
    const accessToken = await keycloak.signIn('consumer-a');
    const { iat = 0, exp = 0 } = decodeJwt(accessToken);
    let current = new Date(iat * 1_000);
    const verifier = verifierFor('consumer-bff', () => current);

    const beforeExpiry = await verifier(accessToken);
    current = new Date((exp + 1) * 1_000);
    const afterExpiry = await verifier(accessToken);

    expect(beforeExpiry.isRight()).toBe(true);
    expect(afterExpiry.isLeft() && afterExpiry.failure.reason).toBe('ERR_JWT_EXPIRED');
  });

  it('refuses a token signed with an algorithm it does not allow', async () => {
    const forgedToken = await new SignJWT()
      .setProtectedHeader({ alg: 'HS256' })
      .setSubject(consumerId)
      .setIssuer(keycloak.issuer)
      .setAudience('consumer-bff')
      .setExpirationTime('1m')
      .sign(new TextEncoder().encode('forged-shared-key-of-thirty-two-bytes'));

    const verified = await verifierFor('consumer-bff')(forgedToken);

    expect(verified.isLeft() && verified.failure.reason).toBe('ERR_JOSE_ALG_NOT_ALLOWED');
  });

  it('refuses a token whose signature was changed', async () => {
    const accessToken = withAnotherSignature(await keycloak.signIn('consumer-a'));

    const verified = await verifierFor('consumer-bff')(accessToken);

    expect(verified.isLeft() && verified.failure.reason).toBe(
      'ERR_JWS_SIGNATURE_VERIFICATION_FAILED',
    );
  });

  it('refuses a value that is not a token', async () => {
    const verified = await verifierFor('consumer-bff')('not-a-token');

    expect(verified.isLeft() && verified.failure.reason).toBe('ERR_JWS_INVALID');
  });

  it('fails instead of refusing the token when the key set cannot be fetched', async () => {
    const accessToken = await keycloak.signIn('consumer-a');
    const verifier = createAccessTokenVerifier({
      issuer: keycloak.issuer,
      audience: 'consumer-bff',
      jwksUrl: `${keycloak.issuer}/protocol/openid-connect/missing-certs`,
    });

    await expect(verifier(accessToken)).rejects.toThrow();
  });
});
