import { randomBytes, randomUUID } from 'node:crypto';
import { beforeAll, describe, expect, it } from 'vitest';
import { DockerComposeStack } from './support/docker-compose-stack.adapter.ts';
import {
  HttpConsumerApi,
  pizzeriaOrder,
  walkingSkeletonConsumerId,
} from './support/http-consumer-api.adapter.ts';
import { HttpTempoApi, type TraceSpan } from './support/http-tempo-api.adapter.ts';

type LogEntry = ReadonlyMap<string, unknown>;

const consumerApi = new HttpConsumerApi();
const tempoApi = new HttpTempoApi();
const stack = new DockerComposeStack();
const tracedServices = [
  'order-service',
  'consumer-service',
  'kitchen-service',
  'accounting-service',
];
const tracedApplications = ['consumer-bff', ...tracedServices];
const sagaConsumerSpanNames = [
  'process consumer.commands',
  'process kitchen.commands',
  'process accounting.commands',
  'process order.place-order-saga.replies',
];

function spansLeavingTheTrace(spans: readonly TraceSpan[]): readonly TraceSpan[] {
  const spanIds = new Set(spans.map((span) => span.spanId));
  return spans.filter((span) => span.parentSpanId === undefined || !spanIds.has(span.parentSpanId));
}

function isWholeTrace(spans: readonly TraceSpan[]): boolean {
  const applications = new Set(spans.map((span) => span.serviceName));
  const isEveryApplicationTraced = tracedApplications.every((name) => applications.has(name));
  return isEveryApplicationTraced && spansLeavingTheTrace(spans).length === 1;
}

function toLogEntry(line: string): LogEntry {
  const parsed: unknown = line.startsWith('{') ? JSON.parse(line) : undefined;
  return new Map(typeof parsed === 'object' && parsed !== null ? Object.entries(parsed) : []);
}

beforeAll(() => consumerApi.waitUntilReachable());

describe('tracing a placed order', () => {
  it('follows the order through every application in one trace that their logs point to', async () => {
    const startedAt = new Date();
    const traceId = randomBytes(16).toString('hex');
    const callerSpanId = randomBytes(8).toString('hex');
    const traceparent = `00-${traceId}-${callerSpanId}-01`;
    const response = await consumerApi.placeOrder(pizzeriaOrder, {
      'idempotency-key': randomUUID(),
      'x-consumer-id': walkingSkeletonConsumerId,
      traceparent,
    });
    const orderId = await consumerApi.readPlacedOrderId(response);
    await consumerApi.waitForOrderStatus(orderId, 'APPROVED');

    const spans = await tempoApi.waitForTrace(traceId, isWholeTrace);

    expect(spansLeavingTheTrace(spans)).toMatchObject([
      { serviceName: 'consumer-bff', parentSpanId: callerSpanId },
    ]);
    expect(
      spans
        .filter((span) => span.attributes.get('fooddelivery.order.id') === orderId)
        .map((span) => span.name),
    ).toEqual(expect.arrayContaining(sagaConsumerSpanNames));
    expect(
      new Set(
        spans.filter((span) => span.name.startsWith('pg.query')).map((span) => span.serviceName),
      ),
    ).toEqual(new Set(tracedServices));
    expect(
      spans
        .flatMap((span) => [...span.attributes.values()])
        .filter((attribute) => attribute.includes('tok_')),
    ).toEqual([]);
    const logLines = await stack.readLogLinesSince([...tracedServices, 'envoy'], startedAt);
    const logEntries = logLines.map(toLogEntry);
    expect(
      new Set(
        logEntries
          .filter((entry) => entry.get('trace_id') === traceId)
          .map((entry) => entry.get('service')),
      ),
    ).toEqual(new Set(tracedServices));
    expect(logEntries.map((entry) => entry.get('traceparent'))).toContain(traceparent);
  });
});
