import {
  Code,
  ConnectError,
  createClient,
  createRouterTransport,
  type Client,
} from '@connectrpc/connect';
import { runInRootSpan } from '@fd/chassis-observability';
import { recordSpans, SpanKind, SpanStatusCode, traceparentOf } from '@fd/chassis-testing';
import { OrderService } from '@fd/contracts/fooddelivery/order/v1/service_pb.js';
import { beforeEach, describe, expect, it } from 'vitest';
import { traceContextInterceptor } from './trace-context-interceptor.ts';

const spans = recordSpans();

let receivedTraceparents: (string | null)[];

function tracedClient(): Client<typeof OrderService> {
  return createClient(
    OrderService,
    createRouterTransport(
      ({ service }) => {
        service(OrderService, {
          placeOrder: (request, context) => {
            receivedTraceparents.push(context.requestHeader.get('traceparent'));
            return { orderId: '0199a5d0-0000-7000-8000-0000000000a1' };
          },
          getOrder: (request) => {
            throw new ConnectError(request.orderId, Code.NotFound);
          },
        });
      },
      { transport: { interceptors: [traceContextInterceptor] } },
    ),
  );
}

beforeEach(() => {
  receivedTraceparents = [];
  spans.reset();
});

describe('traceContextInterceptor', () => {
  it('calls the service in a client span and sends that span as traceparent', async () => {
    await runInRootSpan('handling request', () => tracedClient().placeOrder({}));

    const [call] = spans.spansNamed('fooddelivery.order.v1.OrderService/PlaceOrder');
    const [request] = spans.spansNamed('handling request');
    expect(call?.kind).toBe(SpanKind.CLIENT);
    expect(call?.parentSpanContext?.spanId).toBe(request?.spanContext().spanId);
    expect(call?.attributes).toEqual({
      'rpc.system': 'connect_rpc',
      'rpc.service': 'fooddelivery.order.v1.OrderService',
      'rpc.method': 'PlaceOrder',
    });
    expect(receivedTraceparents).toEqual([traceparentOf(call)]);
  });

  it('marks the client span as failed when the call fails', async () => {
    await expect(
      tracedClient().getOrder({ orderId: '0199a5d0-0000-7000-8000-0000000000ff' }),
    ).rejects.toThrow();

    const [call] = spans.spansNamed('fooddelivery.order.v1.OrderService/GetOrder');
    expect(call?.status.code).toBe(SpanStatusCode.ERROR);
  });
});
