import { describe, expect, it } from 'vitest';
import { readConsumerServiceConfiguration } from './consumer-service.config.ts';

const requiredVariables = {
  CONSUMER_DATABASE_URL: 'postgresql://consumer_service:secret@127.0.0.1:5433/consumer_service',
  KAFKA_BOOTSTRAP_SERVERS: ' localhost:9092, ,localhost:9093,localhost:9094 ',
  ACCESS_TOKEN_ISSUER: 'http://localhost:8180/realms/food-delivery',
  ACCESS_TOKEN_JWKS_URL: 'http://keycloak:8080/realms/food-delivery/protocol/openid-connect/certs',
};

const accessTokenSettings = {
  accessTokenIssuer: 'http://localhost:8180/realms/food-delivery',
  accessTokenJwksUrl: 'http://keycloak:8080/realms/food-delivery/protocol/openid-connect/certs',
};

describe('readConsumerServiceConfiguration', () => {
  it('reads the required variables and defaults the log level', () => {
    expect(readConsumerServiceConfiguration(requiredVariables)).toEqual({
      databaseUrl: 'postgresql://consumer_service:secret@127.0.0.1:5433/consumer_service',
      kafkaBootstrapServers: ['localhost:9092', 'localhost:9093', 'localhost:9094'],
      host: '127.0.0.1',
      port: 4002,
      logLevel: 'info',
      housekeepingIntervalInMilliseconds: 3_600_000,
      ...accessTokenSettings,
    });
  });

  it('reads the postgres scheme, the log level and the explicit overrides', () => {
    const configuration = readConsumerServiceConfiguration({
      ...requiredVariables,
      CONSUMER_DATABASE_URL: 'postgres://consumer_service:secret@127.0.0.1:5433/consumer_service',
      KAFKA_BOOTSTRAP_SERVERS: 'localhost:9092',
      CONSUMER_SERVICE_HOST: '0.0.0.0',
      CONSUMER_SERVICE_PORT: '5002',
      LOG_LEVEL: 'debug',
      HOUSEKEEPING_INTERVAL_IN_MILLISECONDS: '60000',
    });

    expect(configuration).toEqual({
      databaseUrl: 'postgres://consumer_service:secret@127.0.0.1:5433/consumer_service',
      kafkaBootstrapServers: ['localhost:9092'],
      host: '0.0.0.0',
      port: 5002,
      logLevel: 'debug',
      housekeepingIntervalInMilliseconds: 60_000,
      ...accessTokenSettings,
    });
  });

  it.each([
    {
      problem: 'a missing database url',
      variables: { ...requiredVariables, CONSUMER_DATABASE_URL: undefined },
    },
    {
      problem: 'a database url of another kind',
      variables: { ...requiredVariables, CONSUMER_DATABASE_URL: 'mysql://localhost/consumer' },
    },
    {
      problem: 'no bootstrap server',
      variables: { ...requiredVariables, KAFKA_BOOTSTRAP_SERVERS: ' , ' },
    },
    {
      problem: 'a port out of range',
      variables: { ...requiredVariables, CONSUMER_SERVICE_PORT: '70000' },
    },
    { problem: 'an unknown log level', variables: { ...requiredVariables, LOG_LEVEL: 'verbose' } },
    {
      problem: 'a housekeeping interval of zero',
      variables: { ...requiredVariables, HOUSEKEEPING_INTERVAL_IN_MILLISECONDS: '0' },
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
      problem: 'a key set url that is not an http url',
      variables: { ...requiredVariables, ACCESS_TOKEN_JWKS_URL: 'keycloak:8080/certs' },
    },
  ])('refuses $problem', ({ variables }) => {
    expect(() => readConsumerServiceConfiguration(variables)).toThrow('invalid environment');
  });
});
