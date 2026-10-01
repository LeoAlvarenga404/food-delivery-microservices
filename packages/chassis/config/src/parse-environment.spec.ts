import { z } from 'zod';
import { describe, expect, it } from 'vitest';
import { parseEnvironment } from './parse-environment.ts';

const orderServiceEnvironment = z
  .object({
    DATABASE_URL: z.url(),
    KAFKA_BOOTSTRAP_SERVERS: z.string().min(1),
    RPC_PORT: z.coerce.number().int().positive(),
    LOG_LEVEL: z.enum(['debug', 'info', 'warn', 'error']).default('info'),
  })
  .transform((environment) => ({
    databaseUrl: environment.DATABASE_URL,
    kafkaBootstrapServers: environment.KAFKA_BOOTSTRAP_SERVERS.split(','),
    rpcPort: environment.RPC_PORT,
    logLevel: environment.LOG_LEVEL,
  }));

describe('parseEnvironment', () => {
  it('turns environment variables into a typed camelCase configuration', () => {
    const configuration = parseEnvironment(orderServiceEnvironment, {
      DATABASE_URL: 'postgres://order_service:secret@localhost:5432/order_service',
      KAFKA_BOOTSTRAP_SERVERS: 'localhost:9092,localhost:9093',
      RPC_PORT: '50051',
    });

    expect(configuration).toEqual({
      databaseUrl: 'postgres://order_service:secret@localhost:5432/order_service',
      kafkaBootstrapServers: ['localhost:9092', 'localhost:9093'],
      rpcPort: 50051,
      logLevel: 'info',
    });
  });

  it('names every invalid variable without echoing its value', () => {
    const parsing = () =>
      parseEnvironment(orderServiceEnvironment, {
        DATABASE_URL: 'not-a-url-with-secret',
        RPC_PORT: 'fifty',
      });

    expect(parsing).toThrow(/^invalid environment: /);
    expect(parsing).toThrow(/DATABASE_URL: /);
    expect(parsing).toThrow(/KAFKA_BOOTSTRAP_SERVERS: /);
    expect(parsing).toThrow(/RPC_PORT: /);
    expect(parsing).not.toThrow(/not-a-url-with-secret/);
  });
});
