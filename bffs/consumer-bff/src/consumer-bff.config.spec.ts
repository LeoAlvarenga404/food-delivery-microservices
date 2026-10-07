import { describe, expect, it } from 'vitest';
import { readConsumerBffConfiguration } from './consumer-bff.config.ts';

const requiredVariables = {
  ORDER_SERVICE_URL: 'http://127.0.0.1:4001',
  CONSUMER_SERVICE_URL: 'http://127.0.0.1:4002',
  RESTAURANT_SERVICE_URL: 'http://127.0.0.1:4005',
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
  it('reads the service urls and the access settings and defaults the rest', () => {
    expect(readConsumerBffConfiguration(requiredVariables)).toEqual({
      orderServiceUrl: 'http://127.0.0.1:4001',
      orderServiceTimeoutInMilliseconds: 5000,
      consumerServiceUrl: 'http://127.0.0.1:4002',
      consumerServiceTimeoutInMilliseconds: 5000,
      restaurantServiceUrl: 'http://127.0.0.1:4005',
      restaurantServiceTimeoutInMilliseconds: 5000,
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
        CONSUMER_SERVICE_URL: 'http://consumer-service:4002',
        CONSUMER_SERVICE_TIMEOUT_IN_MILLISECONDS: '1500',
        RESTAURANT_SERVICE_URL: 'http://restaurant-service:4005',
        RESTAURANT_SERVICE_TIMEOUT_IN_MILLISECONDS: '2000',
        CONSUMER_BFF_HOST: '0.0.0.0',
        CONSUMER_BFF_PORT: '8000',
        LOG_LEVEL: 'warn',
      }),
    ).toEqual({
      orderServiceUrl: 'http://order-service:4001',
      orderServiceTimeoutInMilliseconds: 2500,
      consumerServiceUrl: 'http://consumer-service:4002',
      consumerServiceTimeoutInMilliseconds: 1500,
      restaurantServiceUrl: 'http://restaurant-service:4005',
      restaurantServiceTimeoutInMilliseconds: 2000,
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
      problem: 'a missing consumer service url',
      variables: { ...requiredVariables, CONSUMER_SERVICE_URL: undefined },
    },
    {
      problem: 'a consumer service url of another kind',
      variables: { ...requiredVariables, CONSUMER_SERVICE_URL: 'grpc://consumer:4002' },
    },
    {
      problem: 'a missing restaurant service url',
      variables: { ...requiredVariables, RESTAURANT_SERVICE_URL: undefined },
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
      problem: 'a zero consumer service timeout',
      variables: { ...requiredVariables, CONSUMER_SERVICE_TIMEOUT_IN_MILLISECONDS: '0' },
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
