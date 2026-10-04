import { Writable } from 'node:stream';
import { Code, ConnectError, createClient, createRouterTransport } from '@connectrpc/connect';
import { createLogger } from '@fd/chassis-observability';
import { RestaurantService } from '@fd/contracts/fooddelivery/restaurant/v1/service_pb.js';
import { beforeEach, describe, expect, it } from 'vitest';
import { createRestaurantRpcInterceptors } from './restaurant-rpc-interceptors.adapter.ts';

const unreachableKeySetUrl =
  'http://127.0.0.1:1/realms/food-delivery/protocol/openid-connect/certs';
const correlationId = '0199a5d0-0000-7000-8000-0000000000f2';

let logEntries: Record<string, unknown>[];

function encodedSegment(content: object): string {
  return Buffer.from(JSON.stringify(content)).toString('base64url');
}

const wellFormedAccessToken = [
  encodedSegment({ alg: 'RS256', kid: 'unknown-key' }),
  encodedSegment({ sub: '0199a5d0-0000-7000-8000-0000000000e1' }),
  'c2lnbmF0dXJl',
].join('.');

function clientWithInterceptors(): ReturnType<typeof createClient<typeof RestaurantService>> {
  const destination = new Writable({
    write(chunk: Buffer, encoding, callback) {
      const parsed: unknown = JSON.parse(chunk.toString());
      logEntries.push(typeof parsed === 'object' && parsed !== null ? { ...parsed } : {});
      callback();
    },
  });
  const interceptors = createRestaurantRpcInterceptors(
    {
      databaseUrl: 'postgres://restaurant-db:5432/restaurant_service',
      host: '127.0.0.1',
      port: 0,
      logLevel: 'info',
      housekeepingIntervalInMilliseconds: 3_600_000,
      accessTokenIssuer: 'http://localhost:8180/realms/food-delivery',
      accessTokenJwksUrl: unreachableKeySetUrl,
    },
    createLogger({ serviceName: 'restaurant-service', level: 'info' }, destination),
  );
  const transport = createRouterTransport(
    ({ service }) => {
      service(RestaurantService, { listMemberships: () => ({}) });
    },
    { router: { interceptors } },
  );
  return createClient(RestaurantService, transport);
}

async function rejectionOf(call: Promise<unknown>): Promise<ConnectError> {
  return ConnectError.from(
    await call.then(
      () => undefined,
      (rejection: unknown) => rejection,
    ),
  );
}

beforeEach(() => {
  logEntries = [];
});

describe('createRestaurantRpcInterceptors', () => {
  it('refuses a call without a token and still echoes the correlation id', async () => {
    const error = await rejectionOf(
      clientWithInterceptors().listMemberships(
        {},
        { headers: { 'x-correlation-id': correlationId } },
      ),
    );

    expect(error.code).toBe(Code.Unauthenticated);
    expect(error.metadata.get('x-correlation-id')).toBe(correlationId);
  });

  it('answers an unreachable key set as an internal failure it logs, never as unauthenticated', async () => {
    const error = await rejectionOf(
      clientWithInterceptors().listMemberships(
        {},
        { headers: { authorization: `Bearer ${wellFormedAccessToken}` } },
      ),
    );

    expect(error.code).toBe(Code.Internal);
    expect(logEntries.map((entry) => entry['msg'])).toEqual(['rpc call failed']);
  });
});
