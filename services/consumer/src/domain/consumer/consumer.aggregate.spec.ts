import { left, right } from '@fd/domain';
import { describe, expect, it } from 'vitest';
import { activeConsumerId, buildConsumer } from '../../../test/support/consumer.builder.ts';
import type { ConsumerSnapshot } from './consumer.aggregate.ts';

describe('Consumer', () => {
  it('lets an active consumer order', () => {
    expect(buildConsumer().verifyMayOrder()).toEqual(right(undefined));
  });

  it('refuses a blocked consumer', () => {
    expect(buildConsumer({ status: 'BLOCKED' }).verifyMayOrder()).toEqual(
      left({ type: 'ConsumerBlocked', consumerId: activeConsumerId }),
    );
  });

  it('restores the snapshot it was given', () => {
    const snapshot: ConsumerSnapshot = {
      consumerId: activeConsumerId,
      status: 'BLOCKED',
      version: 3,
    };

    expect(buildConsumer(snapshot).toSnapshot()).toEqual(snapshot);
  });
});
