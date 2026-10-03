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
      logLevel: 'info',
    });
  });

  it('reads the postgres scheme, the log level and the explicit overrides', () => {
    const configuration = readKitchenServiceConfiguration({
      KITCHEN_DATABASE_URL: 'postgres://kitchen_service:secret@127.0.0.1:5434/kitchen_service',
      KAFKA_BOOTSTRAP_SERVERS: 'localhost:9092',
      LOG_LEVEL: 'debug',
    });

    expect(configuration).toEqual({
      databaseUrl: 'postgres://kitchen_service:secret@127.0.0.1:5434/kitchen_service',
      kafkaBootstrapServers: ['localhost:9092'],
      logLevel: 'debug',
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
    { problem: 'an unknown log level', variables: { ...requiredVariables, LOG_LEVEL: 'verbose' } },
  ])('refuses $problem', ({ variables }) => {
    expect(() => readKitchenServiceConfiguration(variables)).toThrow('invalid environment');
  });
});
