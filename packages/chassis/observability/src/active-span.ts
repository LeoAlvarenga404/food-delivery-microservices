import { context, propagation, SpanStatusCode, trace } from '@opentelemetry/api';

export interface SpanIdentifiers {
  readonly orderId?: string | undefined;
  readonly sagaId?: string | undefined;
}

const orderIdAttribute = 'fooddelivery.order.id';
const sagaIdAttribute = 'fooddelivery.saga.id';

export function activeTraceparent(): string | undefined {
  const carrier: Record<string, string> = {};
  propagation.inject(context.active(), carrier);
  return carrier['traceparent'];
}

export function annotateActiveSpan(identifiers: SpanIdentifiers): void {
  const span = trace.getActiveSpan();
  if (identifiers.orderId !== undefined) span?.setAttribute(orderIdAttribute, identifiers.orderId);
  if (identifiers.sagaId !== undefined) span?.setAttribute(sagaIdAttribute, identifiers.sagaId);
}

export function recordActiveSpanFailure(error: unknown): void {
  const span = trace.getActiveSpan();
  span?.recordException(error instanceof Error ? error : String(error));
  span?.setStatus({ code: SpanStatusCode.ERROR });
}
