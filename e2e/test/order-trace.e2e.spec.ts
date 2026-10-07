import { randomBytes, randomUUID } from 'node:crypto';
import { setTimeout as delay } from 'node:timers/promises';
import { beforeAll, describe, expect, it } from 'vitest';
import { DockerComposeStack } from './support/docker-compose-stack.adapter.ts';
import {
  HttpConsumerApi,
  openPizzeria,
  type PizzeriaOrder,
} from './support/http-consumer-api.adapter.ts';
import { HttpTempoApi, type TraceSpan } from './support/http-tempo-api.adapter.ts';

type LogEntry = ReadonlyMap<string, unknown>;

const consumerApi = new HttpConsumerApi('consumer-a');
const tempoApi = new HttpTempoApi();
const stack = new DockerComposeStack();
let pizzeriaOrder: PizzeriaOrder;
const tracedServices = [
  'order-service',
  'consumer-service',
  'kitchen-service',
  'accounting-service',
];
const tracedApplications = ['consumer-bff', ...tracedServices];
const envoyLogFlushLimitInMilliseconds = 20_000;
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

async function readLogEntriesUntilEnvoyLogged(
  since: Date,
  traceparent: string,
): Promise<readonly LogEntry[]> {
  const deadlineInMilliseconds = Date.now() + envoyLogFlushLimitInMilliseconds;
  let logEntries: readonly LogEntry[] = [];
  while (Date.now() < deadlineInMilliseconds) {
    const logLines = await stack.readLogLinesSince([...tracedServices, 'envoy'], since);
    logEntries = logLines.map(toLogEntry);
    if (logEntries.some((entry) => entry.get('traceparent') === traceparent)) return logEntries;
    await delay(1_000);
  }
  return logEntries;
}

beforeAll(async () => {
  await consumerApi.waitUntilReachableAndRegistered();
  pizzeriaOrder = await openPizzeria();
});

describe('tracing a placed order', () => {
  it('follows the order through every application in one trace that their logs point to', async () => {
    const startedAt = new Date();
    const traceId = randomBytes(16).toString('hex');
    const callerSpanId = randomBytes(8).toString('hex');
    const traceparent = `00-${traceId}-${callerSpanId}-01`;
    const response = await consumerApi.placeOrder(pizzeriaOrder, {
      'idempotency-key': randomUUID(),
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
    const logEntries = await readLogEntriesUntilEnvoyLogged(startedAt, traceparent);
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
