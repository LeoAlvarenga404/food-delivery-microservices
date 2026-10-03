import { describe, expect, it } from 'vitest';
import { readOrderServiceConfiguration } from './order-service.config.ts';

const requiredVariables = {
  ORDER_DATABASE_URL: 'postgres://order_service:secret@127.0.0.1:5432/order_service',
  KAFKA_BOOTSTRAP_SERVERS: 'localhost:9092,localhost:9093,localhost:9094',
};

describe('readOrderServiceConfiguration', () => {
  it('reads the required variables and defaults the rest to a loopback listener', () => {
    expect(readOrderServiceConfiguration(requiredVariables)).toEqual({
      databaseUrl: 'postgres://order_service:secret@127.0.0.1:5432/order_service',
      kafkaBootstrapServers: ['localhost:9092', 'localhost:9093', 'localhost:9094'],
      host: '127.0.0.1',
      port: 4001,
      logLevel: 'info',
    });
  });

  it('accepts the postgresql scheme and trims the bootstrap servers, dropping empty entries', () => {
    const configuration = readOrderServiceConfiguration({
      ORDER_DATABASE_URL: 'postgresql://order_service:secret@127.0.0.1:5432/order_service',
      KAFKA_BOOTSTRAP_SERVERS: ' localhost:9092 , localhost:9093,, ',
    });

    expect(configuration.databaseUrl).toBe(
      'postgresql://order_service:secret@127.0.0.1:5432/order_service',
    );
    expect(configuration.kafkaBootstrapServers).toEqual(['localhost:9092', 'localhost:9093']);
  });

  it.each([
    { problem: 'a missing database url', variables: { KAFKA_BOOTSTRAP_SERVERS: 'localhost:9092' } },
    {
      problem: 'a port out of range',
      variables: { ...requiredVariables, ORDER_SERVICE_PORT: '70000' },
    },
    { problem: 'an empty port', variables: { ...requiredVariables, ORDER_SERVICE_PORT: '' } },
    { problem: 'a port of zero', variables: { ...requiredVariables, ORDER_SERVICE_PORT: '0' } },
    {
      problem: 'bootstrap servers made only of separators',
      variables: { ...requiredVariables, KAFKA_BOOTSTRAP_SERVERS: ' , ,' },
    },
    {
      problem: 'a database url with another scheme',
      variables: { ...requiredVariables, ORDER_DATABASE_URL: 'mysql://order_service@127.0.0.1/db' },
    },
    { problem: 'an unknown log level', variables: { ...requiredVariables, LOG_LEVEL: 'verbose' } },
  ])('refuses $problem', ({ variables }) => {
    expect(() => readOrderServiceConfiguration(variables)).toThrow('invalid environment');
  });
});
