import { describe, expect, it } from 'vitest';
import { readConsumerBffConfiguration } from './consumer-bff.config.ts';

const requiredVariables = {
  ORDER_SERVICE_URL: 'http://127.0.0.1:4001',
  ACCESS_TOKEN_ISSUER: 'http://localhost:8180/realms/food-delivery',
  ACCESS_TOKEN_JWKS_URL: 'http://keycloak:8080/realms/food-delivery/protocol/openid-connect/certs',
  TOKEN_EXCHANGE_URL: 'http://keycloak:8080/realms/food-delivery/protocol/openid-connect/token',
  CONSUMER_BFF_CLIENT_SECRET: 'local-consumer-bff-secret',
};

const accessSettings = {
  accessTokenIssuer: 'http://localhost:8180/realms/food-delivery',
  accessTokenJwksUrl: 'http://keycloak:8080/realms/food-delivery/protocol/openid-connect/certs',
  tokenExchangeUrl: 'http://keycloak:8080/realms/food-delivery/protocol/openid-connect/token',
  clientSecret: 'local-consumer-bff-secret',
};

describe('readConsumerBffConfiguration', () => {
  it('reads the order service url and the access settings and defaults the rest', () => {
    expect(readConsumerBffConfiguration(requiredVariables)).toEqual({
      orderServiceUrl: 'http://127.0.0.1:4001',
      orderServiceTimeoutInMilliseconds: 5000,
      ...accessSettings,
      host: '127.0.0.1',
      port: 4000,
      logLevel: 'info',
    });
  });

  it('reads every variable when present', () => {
    expect(
      readConsumerBffConfiguration({
        ...requiredVariables,
        ORDER_SERVICE_URL: 'http://order-service:4001',
        ORDER_SERVICE_TIMEOUT_IN_MILLISECONDS: '2500',
        CONSUMER_BFF_HOST: '0.0.0.0',
        CONSUMER_BFF_PORT: '8000',
        LOG_LEVEL: 'warn',
      }),
    ).toEqual({
      orderServiceUrl: 'http://order-service:4001',
      orderServiceTimeoutInMilliseconds: 2500,
      ...accessSettings,
      host: '0.0.0.0',
      port: 8000,
      logLevel: 'warn',
    });
  });

  it.each([
    {
      problem: 'a missing order service url',
      variables: { ...requiredVariables, ORDER_SERVICE_URL: undefined },
    },
    {
      problem: 'an order service url of another kind',
      variables: { ...requiredVariables, ORDER_SERVICE_URL: 'grpc://order:4001' },
    },
    {
      problem: 'a missing token exchange url',
      variables: { ...requiredVariables, TOKEN_EXCHANGE_URL: undefined },
    },
    {
      problem: 'a missing access token issuer',
      variables: { ...requiredVariables, ACCESS_TOKEN_ISSUER: undefined },
    },
    {
      problem: 'a missing key set url',
      variables: { ...requiredVariables, ACCESS_TOKEN_JWKS_URL: undefined },
    },
    {
      problem: 'a token exchange url that is not an http url',
      variables: { ...requiredVariables, TOKEN_EXCHANGE_URL: 'keycloak:8080/token' },
    },
    {
      problem: 'an empty client secret',
      variables: { ...requiredVariables, CONSUMER_BFF_CLIENT_SECRET: '' },
    },
    {
      problem: 'a zero timeout',
      variables: { ...requiredVariables, ORDER_SERVICE_TIMEOUT_IN_MILLISECONDS: '0' },
    },
    {
      problem: 'a port out of range',
      variables: { ...requiredVariables, CONSUMER_BFF_PORT: '70000' },
    },
    {
      problem: 'a timeout beyond the timer limit',
      variables: { ...requiredVariables, ORDER_SERVICE_TIMEOUT_IN_MILLISECONDS: '2147483648' },
    },
    { problem: 'an unknown log level', variables: { ...requiredVariables, LOG_LEVEL: 'verbose' } },
  ])('refuses $problem', ({ variables }) => {
    expect(() => readConsumerBffConfiguration(variables)).toThrow('invalid environment');
  });
});
