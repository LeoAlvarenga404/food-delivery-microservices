import { describe, expect, it } from 'vitest';
import { parseMessageHeaders } from './message-headers.ts';
import { PermanentMessageFailure } from './permanent-message-failure.ts';

const relayedHeaders = {
  'message-id': Buffer.from('0192a1b2-0000-7000-8000-000000000001'),
  'message-type': Buffer.from('fooddelivery.kitchen.v1.CreateTicket'),
  'correlation-id': Buffer.from('0192a1b2-0000-7000-8000-0000000000c1'),
  'causation-id': Buffer.from(''),
  'saga-id': Buffer.from('0192a1b2-0000-7000-8000-0000000000a1'),
  traceparent: Buffer.from(''),
  'actor-id': Buffer.from('consumer-1'),
  'actor-type': Buffer.from('consumer'),
};

describe('parseMessageHeaders', () => {
  it('reads the outbox headers and treats empty ones as absent', () => {
    expect(parseMessageHeaders(relayedHeaders)).toEqual({
      messageId: '0192a1b2-0000-7000-8000-000000000001',
      messageType: 'fooddelivery.kitchen.v1.CreateTicket',
      correlationId: '0192a1b2-0000-7000-8000-0000000000c1',
      causationId: undefined,
      sagaId: '0192a1b2-0000-7000-8000-0000000000a1',
      traceparent: undefined,
      actorId: 'consumer-1',
      actorType: 'consumer',
    });
  });

  it('treats a missing optional header as absent', () => {
    const withoutSagaId = Object.fromEntries(
      Object.entries(relayedHeaders).filter(([name]) => name !== 'saga-id'),
    );

    expect(parseMessageHeaders(withoutSagaId).sagaId).toBeUndefined();
  });

  it.each(['message-id', 'message-type', 'correlation-id'])(
    'rejects a message without %s as a permanent failure',
    (requiredHeader) => {
      const headers = { ...relayedHeaders, [requiredHeader]: Buffer.from('') };

      expect(() => parseMessageHeaders(headers)).toThrow(PermanentMessageFailure);
      expect(() => parseMessageHeaders(headers)).toThrow(
        `missing required header ${requiredHeader}`,
      );
    },
  );

  it.each(['message-id', 'correlation-id', 'causation-id', 'saga-id'])(
    'rejects a non uuid %s as a permanent failure without echoing it',
    (identifierHeader) => {
      const headers = { ...relayedHeaders, [identifierHeader]: Buffer.from('order-17') };

      expect(() => parseMessageHeaders(headers)).toThrow(PermanentMessageFailure);
      expect(() => parseMessageHeaders(headers)).toThrow(
        `header ${identifierHeader} is not a uuid`,
      );
      expect(() => parseMessageHeaders(headers)).not.toThrow(/order-17/);
    },
  );

  it('reads uuid headers in canonical lowercase form', () => {
    const headers = {
      ...relayedHeaders,
      'message-id': Buffer.from('0192A1B2-0000-7000-8000-00000000000A'),
      'correlation-id': Buffer.from('0192A1B2-0000-7000-8000-00000000000B'),
      'causation-id': Buffer.from('0192A1B2-0000-7000-8000-00000000000C'),
      'saga-id': Buffer.from('0192A1B2-0000-7000-8000-00000000000D'),
    };

    const parsed = parseMessageHeaders(headers);

    expect([parsed.messageId, parsed.correlationId, parsed.causationId, parsed.sagaId]).toEqual([
      '0192a1b2-0000-7000-8000-00000000000a',
      '0192a1b2-0000-7000-8000-00000000000b',
      '0192a1b2-0000-7000-8000-00000000000c',
      '0192a1b2-0000-7000-8000-00000000000d',
    ]);
  });
});
