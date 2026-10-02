import { describe, expect, it } from 'vitest';
import { readConsumerServiceConfiguration } from './consumer-service.config.ts';

const requiredVariables = {
  CONSUMER_DATABASE_URL: 'postgresql://consumer_service:secret@127.0.0.1:5433/consumer_service',
  KAFKA_BOOTSTRAP_SERVERS: ' localhost:9092, ,localhost:9093,localhost:9094 ',
};

describe('readConsumerServiceConfiguration', () => {
  it('reads the required variables and defaults the log level', () => {
    expect(readConsumerServiceConfiguration(requiredVariables)).toEqual({
      databaseUrl: 'postgresql://consumer_service:secret@127.0.0.1:5433/consumer_service',
      kafkaBootstrapServers: ['localhost:9092', 'localhost:9093', 'localhost:9094'],
      logLevel: 'info',
    });
  });

  it.each([
    { problem: 'a missing database url', variables: { KAFKA_BOOTSTRAP_SERVERS: 'localhost:9092' } },
    {
      problem: 'a database url of another kind',
      variables: { ...requiredVariables, CONSUMER_DATABASE_URL: 'mysql://localhost/consumer' },
    },
    {
      problem: 'no bootstrap server',
      variables: { ...requiredVariables, KAFKA_BOOTSTRAP_SERVERS: ' , ' },
    },
    { problem: 'an unknown log level', variables: { ...requiredVariables, LOG_LEVEL: 'verbose' } },
  ])('refuses $problem', ({ variables }) => {
    expect(() => readConsumerServiceConfiguration(variables)).toThrow('invalid environment');
  });
});
