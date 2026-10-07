import { Writable } from 'node:stream';
import { Code, ConnectError, createClient, createRouterTransport } from '@connectrpc/connect';
import { createLogger } from '@fd/chassis-observability';
import { OrderService } from '@fd/contracts/fooddelivery/order/v1/service_pb.js';
import { beforeEach, describe, expect, it } from 'vitest';
import { createServiceRpcInterceptors } from './service-rpc-interceptors.ts';

const unreachableKeySetUrl =
  'http://127.0.0.1:1/realms/food-delivery/protocol/openid-connect/certs';
const correlationId = '0199a5d0-0000-7000-8000-0000000000e2';

let logEntries: Record<string, unknown>[];

function encodedSegment(content: object): string {
  return Buffer.from(JSON.stringify(content)).toString('base64url');
}

const wellFormedAccessToken = [
  encodedSegment({ alg: 'RS256', kid: 'unknown-key' }),
  encodedSegment({ sub: '0199a5d0-0000-7000-8000-0000000000c1' }),
  'c2lnbmF0dXJl',
].join('.');

function clientWithInterceptors(): ReturnType<typeof createClient<typeof OrderService>> {
  const destination = new Writable({
    write(chunk: Buffer, encoding, callback) {
      const parsed: unknown = JSON.parse(chunk.toString());
      logEntries.push(typeof parsed === 'object' && parsed !== null ? { ...parsed } : {});
      callback();
    },
  });
  const interceptors = createServiceRpcInterceptors(
    'order-service',
    {
      accessTokenIssuer: 'http://localhost:8180/realms/food-delivery',
      accessTokenJwksUrl: unreachableKeySetUrl,
    },
    createLogger({ serviceName: 'order-service', level: 'info' }, destination),
  );
  const transport = createRouterTransport(
    ({ service }) => {
      service(OrderService, { getOrder: () => ({}) });
    },
    { router: { interceptors } },
  );
  return createClient(OrderService, transport);
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

describe('createServiceRpcInterceptors', () => {
  it('refuses a call without a token and still echoes the correlation id', async () => {
    const error = await rejectionOf(
      clientWithInterceptors().getOrder({}, { headers: { 'x-correlation-id': correlationId } }),
    );

    expect(error.code).toBe(Code.Unauthenticated);
    expect(error.metadata.get('x-correlation-id')).toBe(correlationId);
  });

  it('answers an unreachable key set as an internal failure it logs, never as unauthenticated', async () => {
    const error = await rejectionOf(
      clientWithInterceptors().getOrder(
        {},
        { headers: { authorization: `Bearer ${wellFormedAccessToken}` } },
      ),
    );

    expect(error.code).toBe(Code.Internal);
    expect(error.metadata.get('x-correlation-id')).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
    );
    expect(logEntries.map((entry) => entry['msg'])).toEqual(['rpc call failed']);
  });
});
