import { describe, expect, it } from 'vitest';
import { readRestaurantBffConfiguration } from './restaurant-bff.config.ts';

const requiredVariables = {
  RESTAURANT_SERVICE_URL: 'http://127.0.0.1:4005',
  ACCESS_TOKEN_ISSUER: 'http://localhost:8180/realms/food-delivery',
  ACCESS_TOKEN_JWKS_URL: 'http://keycloak:8080/realms/food-delivery/protocol/openid-connect/certs',
  TOKEN_EXCHANGE_URL: 'http://keycloak:8080/realms/food-delivery/protocol/openid-connect/token',
  RESTAURANT_BFF_CLIENT_SECRET: 'local-restaurant-bff-secret',
};

const accessSettings = {
  accessTokenIssuer: 'http://localhost:8180/realms/food-delivery',
  accessTokenJwksUrl: 'http://keycloak:8080/realms/food-delivery/protocol/openid-connect/certs',
  tokenExchangeUrl: 'http://keycloak:8080/realms/food-delivery/protocol/openid-connect/token',
  clientSecret: 'local-restaurant-bff-secret',
};

describe('readRestaurantBffConfiguration', () => {
  it('reads the service url and the access settings and defaults the rest', () => {
    expect(readRestaurantBffConfiguration(requiredVariables)).toEqual({
      restaurantServiceUrl: 'http://127.0.0.1:4005',
      restaurantServiceTimeoutInMilliseconds: 5000,
      ...accessSettings,
      host: '127.0.0.1',
      port: 4006,
      logLevel: 'info',
    });
  });

  it('reads every variable when present', () => {
    expect(
      readRestaurantBffConfiguration({
        ...requiredVariables,
        RESTAURANT_SERVICE_URL: 'http://restaurant-service:4005',
        RESTAURANT_SERVICE_TIMEOUT_IN_MILLISECONDS: '2500',
        RESTAURANT_BFF_HOST: '0.0.0.0',
        RESTAURANT_BFF_PORT: '8006',
        LOG_LEVEL: 'warn',
      }),
    ).toEqual({
      restaurantServiceUrl: 'http://restaurant-service:4005',
      restaurantServiceTimeoutInMilliseconds: 2500,
      ...accessSettings,
      host: '0.0.0.0',
      port: 8006,
      logLevel: 'warn',
    });
  });

  it.each([
    {
      problem: 'a missing restaurant service url',
      variables: { ...requiredVariables, RESTAURANT_SERVICE_URL: undefined },
    },
    {
      problem: 'a restaurant service url of another kind',
      variables: { ...requiredVariables, RESTAURANT_SERVICE_URL: 'grpc://restaurant:4005' },
    },
    {
      problem: 'a token exchange url that is not an http url',
      variables: { ...requiredVariables, TOKEN_EXCHANGE_URL: 'keycloak:8080/token' },
    },
    {
      problem: 'an empty client secret',
      variables: { ...requiredVariables, RESTAURANT_BFF_CLIENT_SECRET: '' },
    },
    {
      problem: 'a zero timeout',
      variables: { ...requiredVariables, RESTAURANT_SERVICE_TIMEOUT_IN_MILLISECONDS: '0' },
    },
    {
      problem: 'a port out of range',
      variables: { ...requiredVariables, RESTAURANT_BFF_PORT: '70000' },
    },
  ])('refuses $problem', ({ variables }) => {
    expect(() => readRestaurantBffConfiguration(variables)).toThrow('invalid environment');
  });
});
