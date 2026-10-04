import { Writable } from 'node:stream';
import {
  Code,
  ConnectError,
  createClient,
  createRouterTransport,
  type Client,
} from '@connectrpc/connect';
import { createLogger } from '@fd/chassis-observability';
import { OrderService } from '@fd/contracts/fooddelivery/order/v1/service_pb.js';
import { beforeEach, describe, expect, it } from 'vitest';
import { correlationIdKey, createRpcCorrelation } from './rpc-correlation.ts';

const generatedCorrelationId = '0199a5d0-0000-7000-8000-0000000000e9';
const callerCorrelationId = '0199A5D0-0000-7000-8000-0000000000E2';

let logEntries: Record<string, unknown>[];
let failure: Error | undefined;
let client: Client<typeof OrderService>;

function captureLogger(): ReturnType<typeof createLogger> {
  const destination = new Writable({
    write(chunk: Buffer, encoding, callback) {
      const parsed: unknown = JSON.parse(chunk.toString());
      logEntries.push(typeof parsed === 'object' && parsed !== null ? { ...parsed } : {});
      callback();
    },
  });
  return createLogger({ serviceName: 'rpc-test', level: 'info' }, destination);
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
  failure = undefined;
  const correlation = createRpcCorrelation({
    logger: captureLogger(),
    generateCorrelationId: () => generatedCorrelationId,
  });
  const transport = createRouterTransport(
    ({ service }) => {
      service(OrderService, {
        getOrder: (request, context) => {
          if (failure !== undefined) throw failure;
          return { orderId: context.values.get(correlationIdKey) };
        },
      });
    },
    { router: { interceptors: [correlation] } },
  );
  client = createClient(OrderService, transport);
});

describe('createRpcCorrelation', () => {
  it('hands the caller correlation id to the handler in lowercase and echoes it', async () => {
    const echoedCorrelationIds: (string | null)[] = [];

    const response = await client.getOrder(
      {},
      {
        headers: { 'x-correlation-id': callerCorrelationId },
        onHeader: (headers) => echoedCorrelationIds.push(headers.get('x-correlation-id')),
      },
    );

    expect(response.orderId).toBe(callerCorrelationId.toLowerCase());
    expect(echoedCorrelationIds).toEqual([callerCorrelationId.toLowerCase()]);
  });

  it.each([
    { scenario: 'without a correlation id', headers: {} },
    { scenario: 'with a correlation id that is not a uuid', headers: { 'x-correlation-id': 'x' } },
  ])('generates a correlation id for a call $scenario', async ({ headers }) => {
    const response = await client.getOrder({}, { headers });

    expect(response.orderId).toBe(generatedCorrelationId);
  });

  it('keeps the code of a refusal and adds the correlation id to it without logging', async () => {
    failure = new ConnectError('order-1', Code.NotFound);

    const error = await rejectionOf(
      client.getOrder({}, { headers: { 'x-correlation-id': callerCorrelationId } }),
    );

    expect(error.code).toBe(Code.NotFound);
    expect(error.metadata.get('x-correlation-id')).toBe(callerCorrelationId.toLowerCase());
    expect(logEntries).toEqual([]);
  });

  it('answers an unexpected failure as an internal error it logs with the procedure', async () => {
    failure = new Error('connection refused by the database');

    const error = await rejectionOf(client.getOrder({}));

    expect(error.code).toBe(Code.Internal);
    expect(error.rawMessage).toBe('internal error');
    expect(error.metadata.get('x-correlation-id')).toBe(generatedCorrelationId);
    expect(logEntries).toMatchObject([
      {
        msg: 'rpc call failed',
        procedure: 'fooddelivery.order.v1.OrderService/GetOrder',
        correlationId: generatedCorrelationId,
      },
    ]);
  });
});
