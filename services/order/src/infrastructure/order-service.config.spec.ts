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

  it.each([
    { problem: 'a missing database url', variables: { KAFKA_BOOTSTRAP_SERVERS: 'localhost:9092' } },
    {
      problem: 'a port out of range',
      variables: { ...requiredVariables, ORDER_SERVICE_PORT: '70000' },
    },
    { problem: 'an unknown log level', variables: { ...requiredVariables, LOG_LEVEL: 'verbose' } },
  ])('refuses $problem', ({ variables }) => {
    expect(() => readOrderServiceConfiguration(variables)).toThrow('invalid environment');
  });
});
