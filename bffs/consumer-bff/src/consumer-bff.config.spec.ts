import { describe, expect, it } from 'vitest';
import { readConsumerBffConfiguration } from './consumer-bff.config.ts';

const requiredVariables = { ORDER_SERVICE_URL: 'http://127.0.0.1:4001' };

describe('readConsumerBffConfiguration', () => {
  it('reads the order service url and defaults the rest', () => {
    expect(readConsumerBffConfiguration(requiredVariables)).toEqual({
      orderServiceUrl: 'http://127.0.0.1:4001',
      orderServiceTimeoutInMilliseconds: 5000,
      host: '127.0.0.1',
      port: 4000,
      logLevel: 'info',
    });
  });

  it('reads every variable when present', () => {
    expect(
      readConsumerBffConfiguration({
        ORDER_SERVICE_URL: 'http://order-service:4001',
        ORDER_SERVICE_TIMEOUT_IN_MILLISECONDS: '2500',
        CONSUMER_BFF_HOST: '0.0.0.0',
        CONSUMER_BFF_PORT: '8000',
        LOG_LEVEL: 'warn',
      }),
    ).toEqual({
      orderServiceUrl: 'http://order-service:4001',
      orderServiceTimeoutInMilliseconds: 2500,
      host: '0.0.0.0',
      port: 8000,
      logLevel: 'warn',
    });
  });

  it.each([
    { problem: 'a missing order service url', variables: {} },
    {
      problem: 'an order service url of another kind',
      variables: { ORDER_SERVICE_URL: 'grpc://order:4001' },
    },
    {
      problem: 'a zero timeout',
      variables: { ...requiredVariables, ORDER_SERVICE_TIMEOUT_IN_MILLISECONDS: '0' },
    },
    {
      problem: 'a port out of range',
      variables: { ...requiredVariables, CONSUMER_BFF_PORT: '70000' },
    },
    {
      problem: 'a timeout beyond the timer limit',
      variables: { ...requiredVariables, ORDER_SERVICE_TIMEOUT_IN_MILLISECONDS: '2147483648' },
    },
    { problem: 'an unknown log level', variables: { ...requiredVariables, LOG_LEVEL: 'verbose' } },
  ])('refuses $problem', ({ variables }) => {
    expect(() => readConsumerBffConfiguration(variables)).toThrow('invalid environment');
  });
});
