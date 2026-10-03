import { describe, expect, it } from 'vitest';
import { environmentVariables } from './environment-variables.ts';

describe('environmentVariables', () => {
  it.each(['postgres://order_service@127.0.0.1/order', 'postgresql://order_service@db/order'])(
    'accepts the database url %s',
    (databaseUrl) => {
      expect(environmentVariables.postgresUrl.safeParse(databaseUrl).success).toBe(true);
    },
  );

  it('refuses a database url that only mentions a postgres url after another prefix', () => {
    expect(environmentVariables.postgresUrl.safeParse('http://proxy?postgres://db').success).toBe(
      false,
    );
  });

  it('refuses a database url of another kind', () => {
    expect(environmentVariables.postgresUrl.safeParse('mysql://order@db/order').success).toBe(
      false,
    );
  });

  it('trims the bootstrap servers and drops empty entries', () => {
    expect(
      environmentVariables.kafkaBootstrapServers.parse(' kafka-1:29092, ,kafka-2:29092 '),
    ).toEqual(['kafka-1:29092', 'kafka-2:29092']);
  });

  it('refuses bootstrap servers made only of separators', () => {
    expect(environmentVariables.kafkaBootstrapServers.safeParse(' , ').success).toBe(false);
  });

  it('listens on the loopback interface unless told otherwise', () => {
    expect(environmentVariables.listenHost.parse(undefined)).toBe('127.0.0.1');
    expect(environmentVariables.listenHost.parse('0.0.0.0')).toBe('0.0.0.0');
  });

  it('refuses an empty listen host', () => {
    expect(environmentVariables.listenHost.safeParse('').success).toBe(false);
  });

  it('reads a listen port from text', () => {
    expect(environmentVariables.listenPort.parse('4001')).toBe(4001);
  });

  it.each(['', '0', '65536', '40.5'])('refuses the listen port "%s"', (port) => {
    expect(environmentVariables.listenPort.safeParse(port).success).toBe(false);
  });

  it.each(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent'])(
    'accepts the log level %s',
    (level) => {
      expect(environmentVariables.logLevel.parse(level)).toBe(level);
    },
  );

  it('defaults the log level to info and refuses unknown levels', () => {
    expect(environmentVariables.logLevel.parse(undefined)).toBe('info');
    expect(environmentVariables.logLevel.safeParse('verbose').success).toBe(false);
  });

  it.each([
    [' 1 ', 1],
    ['2147483647', 2_147_483_647],
  ])('reads the duration "%s" as %d milliseconds', (duration, milliseconds) => {
    expect(environmentVariables.durationInMilliseconds.parse(duration)).toBe(milliseconds);
  });

  it.each(['', ' ', '0', '-5', '1.5', 'one hour', '2147483648'])(
    'refuses the duration "%s"',
    (duration) => {
      expect(environmentVariables.durationInMilliseconds.safeParse(duration).success).toBe(false);
    },
  );
});
