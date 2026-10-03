import { describe, expect, it } from 'vitest';
import { readAccountingServiceConfiguration } from './accounting-service.config.ts';

const requiredVariables = {
  ACCOUNTING_DATABASE_URL:
    'postgresql://accounting_service:secret@127.0.0.1:5435/accounting_service',
  KAFKA_BOOTSTRAP_SERVERS: ' localhost:9092, ,localhost:9093,localhost:9094 ',
};

describe('readAccountingServiceConfiguration', () => {
  it('reads the required variables and defaults the rest', () => {
    expect(readAccountingServiceConfiguration(requiredVariables)).toEqual({
      databaseUrl: 'postgresql://accounting_service:secret@127.0.0.1:5435/accounting_service',
      kafkaBootstrapServers: ['localhost:9092', 'localhost:9093', 'localhost:9094'],
      host: '127.0.0.1',
      port: 4004,
      slowGatewayResponseInMilliseconds: 3000,
      logLevel: 'info',
      housekeepingIntervalInMilliseconds: 3_600_000,
    });
  });

  it('reads the postgres scheme, the log level and the explicit overrides', () => {
    const configuration = readAccountingServiceConfiguration({
      ACCOUNTING_DATABASE_URL:
        'postgres://accounting_service:secret@127.0.0.1:5435/accounting_service',
      KAFKA_BOOTSTRAP_SERVERS: 'localhost:9092',
      ACCOUNTING_SERVICE_HOST: '0.0.0.0',
      ACCOUNTING_SERVICE_PORT: '5004',
      LOG_LEVEL: 'debug',
      HOUSEKEEPING_INTERVAL_IN_MILLISECONDS: '60000',
      SIMULATED_GATEWAY_SLOW_RESPONSE_IN_MILLISECONDS: '250',
    });

    expect(configuration).toEqual({
      databaseUrl: 'postgres://accounting_service:secret@127.0.0.1:5435/accounting_service',
      kafkaBootstrapServers: ['localhost:9092'],
      host: '0.0.0.0',
      port: 5004,
      slowGatewayResponseInMilliseconds: 250,
      logLevel: 'debug',
      housekeepingIntervalInMilliseconds: 60_000,
    });
  });

  it.each([
    { problem: 'a missing database url', variables: { KAFKA_BOOTSTRAP_SERVERS: 'localhost:9092' } },
    {
      problem: 'a database url of another kind',
      variables: { ...requiredVariables, ACCOUNTING_DATABASE_URL: 'mysql://localhost/accounting' },
    },
    {
      problem: 'no bootstrap server',
      variables: { ...requiredVariables, KAFKA_BOOTSTRAP_SERVERS: ' , ' },
    },
    {
      problem: 'a negative gateway delay',
      variables: { ...requiredVariables, SIMULATED_GATEWAY_SLOW_RESPONSE_IN_MILLISECONDS: '-1' },
    },
    {
      problem: 'a blank simulated gateway delay',
      variables: { ...requiredVariables, SIMULATED_GATEWAY_SLOW_RESPONSE_IN_MILLISECONDS: '  ' },
    },
    {
      problem: 'a simulated gateway delay beyond the timer limit',
      variables: {
        ...requiredVariables,
        SIMULATED_GATEWAY_SLOW_RESPONSE_IN_MILLISECONDS: '2147483648',
      },
    },
    {
      problem: 'a port out of range',
      variables: { ...requiredVariables, ACCOUNTING_SERVICE_PORT: '70000' },
    },
    { problem: 'an unknown log level', variables: { ...requiredVariables, LOG_LEVEL: 'verbose' } },
    {
      problem: 'a housekeeping interval of zero',
      variables: { ...requiredVariables, HOUSEKEEPING_INTERVAL_IN_MILLISECONDS: '0' },
    },
  ])('refuses $problem', ({ variables }) => {
    expect(() => readAccountingServiceConfiguration(variables)).toThrow('invalid environment');
  });
});
