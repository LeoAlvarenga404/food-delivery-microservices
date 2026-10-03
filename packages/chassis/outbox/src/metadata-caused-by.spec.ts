import { describe, expect, it } from 'vitest';
import { metadataCausedBy } from './metadata-caused-by.ts';

describe('metadataCausedBy', () => {
  it('chains outgoing messages to the inbound message and keeps its correlation and actor', () => {
    expect(
      metadataCausedBy({
        messageId: '0199a5d0-0000-7000-8000-000000000d01',
        messageType: 'fooddelivery.consumer.v1.VerifyConsumer',
        correlationId: '0199a5d0-0000-7000-8000-0000000000e1',
        causationId: '0199a5d0-0000-7000-8000-000000000d00',
        sagaId: '0199a5d0-0000-7000-8000-0000000000b1',
        actorId: '0199a5d0-0000-7000-8000-0000000000c1',
        actorType: 'consumer',
      }),
    ).toEqual({
      correlationId: '0199a5d0-0000-7000-8000-0000000000e1',
      causationId: '0199a5d0-0000-7000-8000-000000000d01',
      actorId: '0199a5d0-0000-7000-8000-0000000000c1',
      actorType: 'consumer',
    });
  });
});
