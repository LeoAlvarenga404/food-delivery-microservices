import { describe, expect, it } from 'vitest';
import { readKitchenServiceConfiguration } from './kitchen-service.config.ts';

const requiredVariables = {
  KITCHEN_DATABASE_URL: 'postgresql://kitchen_service:secret@127.0.0.1:5434/kitchen_service',
  KAFKA_BOOTSTRAP_SERVERS: ' localhost:9092, ,localhost:9093,localhost:9094 ',
};

describe('readKitchenServiceConfiguration', () => {
  it('reads the required variables and defaults the log level', () => {
    expect(readKitchenServiceConfiguration(requiredVariables)).toEqual({
      databaseUrl: 'postgresql://kitchen_service:secret@127.0.0.1:5434/kitchen_service',
      kafkaBootstrapServers: ['localhost:9092', 'localhost:9093', 'localhost:9094'],
      host: '127.0.0.1',
      port: 4003,
      logLevel: 'info',
      housekeepingIntervalInMilliseconds: 3_600_000,
    });
  });

  it('reads the postgres scheme, the log level and the explicit overrides', () => {
    const configuration = readKitchenServiceConfiguration({
      KITCHEN_DATABASE_URL: 'postgres://kitchen_service:secret@127.0.0.1:5434/kitchen_service',
      KAFKA_BOOTSTRAP_SERVERS: 'localhost:9092',
      KITCHEN_SERVICE_HOST: '0.0.0.0',
      KITCHEN_SERVICE_PORT: '5003',
      LOG_LEVEL: 'debug',
      HOUSEKEEPING_INTERVAL_IN_MILLISECONDS: '60000',
    });

    expect(configuration).toEqual({
      databaseUrl: 'postgres://kitchen_service:secret@127.0.0.1:5434/kitchen_service',
      kafkaBootstrapServers: ['localhost:9092'],
      host: '0.0.0.0',
      port: 5003,
      logLevel: 'debug',
      housekeepingIntervalInMilliseconds: 60_000,
    });
  });

  it.each([
    { problem: 'a missing database url', variables: { KAFKA_BOOTSTRAP_SERVERS: 'localhost:9092' } },
    {
      problem: 'a database url of another kind',
      variables: { ...requiredVariables, KITCHEN_DATABASE_URL: 'mysql://localhost/kitchen' },
    },
    {
      problem: 'no bootstrap server',
      variables: { ...requiredVariables, KAFKA_BOOTSTRAP_SERVERS: ' , ' },
    },
    {
      problem: 'a port out of range',
      variables: { ...requiredVariables, KITCHEN_SERVICE_PORT: '70000' },
    },
    { problem: 'an unknown log level', variables: { ...requiredVariables, LOG_LEVEL: 'verbose' } },
    {
      problem: 'a housekeeping interval of zero',
      variables: { ...requiredVariables, HOUSEKEEPING_INTERVAL_IN_MILLISECONDS: '0' },
    },
  ])('refuses $problem', ({ variables }) => {
    expect(() => readKitchenServiceConfiguration(variables)).toThrow('invalid environment');
  });
});
