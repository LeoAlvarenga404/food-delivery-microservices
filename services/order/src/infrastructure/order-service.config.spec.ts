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
      sagaTimeoutsInMilliseconds: {
        VERIFYING_CONSUMER: 30_000,
        CREATING_TICKET: 30_000,
        AUTHORIZING_PAYMENT: 60_000,
        APPROVING_TICKET: 30_000,
        REJECTING_TICKET: 30_000,
      },
    });
  });

  it('gives the payment step its own timeout and every other step the step timeout', () => {
    const configuration = readOrderServiceConfiguration({
      ...requiredVariables,
      PLACE_ORDER_SAGA_STEP_TIMEOUT_IN_MILLISECONDS: ' 10000 ',
      PLACE_ORDER_SAGA_PAYMENT_TIMEOUT_IN_MILLISECONDS: '20000',
    });

    expect(configuration.sagaTimeoutsInMilliseconds).toEqual({
      VERIFYING_CONSUMER: 10_000,
      CREATING_TICKET: 10_000,
      AUTHORIZING_PAYMENT: 20_000,
      APPROVING_TICKET: 10_000,
      REJECTING_TICKET: 10_000,
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
    {
      problem: 'a step timeout of zero',
      variables: { ...requiredVariables, PLACE_ORDER_SAGA_STEP_TIMEOUT_IN_MILLISECONDS: '0' },
    },
    {
      problem: 'a blank payment timeout',
      variables: { ...requiredVariables, PLACE_ORDER_SAGA_PAYMENT_TIMEOUT_IN_MILLISECONDS: ' ' },
    },
    {
      problem: 'a step timeout that is not a whole number of milliseconds',
      variables: { ...requiredVariables, PLACE_ORDER_SAGA_STEP_TIMEOUT_IN_MILLISECONDS: '1.5' },
    },
  ])('refuses $problem', ({ variables }) => {
    expect(() => readOrderServiceConfiguration(variables)).toThrow('invalid environment');
  });
});
