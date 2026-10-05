import { describe, expect, it } from 'vitest';
import { readRestaurantServiceConfiguration } from './restaurant-service.config.ts';

const requiredVariables = {
  RESTAURANT_DATABASE_URL:
    'postgresql://restaurant_service:secret@127.0.0.1:5436/restaurant_service',
  ACCESS_TOKEN_ISSUER: 'http://localhost:8180/realms/food-delivery',
  ACCESS_TOKEN_JWKS_URL: 'http://keycloak:8080/realms/food-delivery/protocol/openid-connect/certs',
  KAFKA_BOOTSTRAP_SERVERS: 'kafka-1:29092,kafka-2:29092',
  OPENSEARCH_URL: 'http://opensearch:9200',
};

const connectionSettings = {
  accessTokenIssuer: 'http://localhost:8180/realms/food-delivery',
  accessTokenJwksUrl: 'http://keycloak:8080/realms/food-delivery/protocol/openid-connect/certs',
  kafkaBootstrapServers: ['kafka-1:29092', 'kafka-2:29092'],
  openSearchUrl: 'http://opensearch:9200',
};

describe('readRestaurantServiceConfiguration', () => {
  it('reads the required variables and defaults the rest', () => {
    expect(readRestaurantServiceConfiguration(requiredVariables)).toEqual({
      databaseUrl: 'postgresql://restaurant_service:secret@127.0.0.1:5436/restaurant_service',
      host: '127.0.0.1',
      port: 4005,
      logLevel: 'info',
      housekeepingIntervalInMilliseconds: 3_600_000,
      ...connectionSettings,
    });
  });

  it('reads the explicit overrides', () => {
    const configuration = readRestaurantServiceConfiguration({
      ...requiredVariables,
      RESTAURANT_SERVICE_HOST: '0.0.0.0',
      RESTAURANT_SERVICE_PORT: '5005',
      LOG_LEVEL: 'debug',
      HOUSEKEEPING_INTERVAL_IN_MILLISECONDS: '60000',
    });

    expect(configuration).toEqual({
      databaseUrl: 'postgresql://restaurant_service:secret@127.0.0.1:5436/restaurant_service',
      host: '0.0.0.0',
      port: 5005,
      logLevel: 'debug',
      housekeepingIntervalInMilliseconds: 60_000,
      ...connectionSettings,
    });
  });

  it.each([
    {
      problem: 'a missing database url',
      variables: { ...requiredVariables, RESTAURANT_DATABASE_URL: undefined },
    },
    {
      problem: 'a database url of another kind',
      variables: { ...requiredVariables, RESTAURANT_DATABASE_URL: 'mysql://localhost/restaurant' },
    },
    {
      problem: 'a port out of range',
      variables: { ...requiredVariables, RESTAURANT_SERVICE_PORT: '70000' },
    },
    {
      problem: 'a missing access token issuer',
      variables: { ...requiredVariables, ACCESS_TOKEN_ISSUER: undefined },
    },
    {
      problem: 'missing kafka bootstrap servers',
      variables: { ...requiredVariables, KAFKA_BOOTSTRAP_SERVERS: ' , ' },
    },
    {
      problem: 'an OpenSearch url that is not an http url',
      variables: { ...requiredVariables, OPENSEARCH_URL: 'opensearch:9200' },
    },
    {
      problem: 'a key set url that is not an http url',
      variables: { ...requiredVariables, ACCESS_TOKEN_JWKS_URL: 'keycloak:8080/certs' },
    },
  ])('refuses $problem', ({ variables }) => {
    expect(() => readRestaurantServiceConfiguration(variables)).toThrow('invalid environment');
  });
});
