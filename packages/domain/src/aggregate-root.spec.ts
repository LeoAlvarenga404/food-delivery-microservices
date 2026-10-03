import { describe, expect, it } from 'vitest';
import { AggregateRoot } from './aggregate-root.ts';
import type { DomainEvent } from './domain-event.ts';

interface SampleHappened extends DomainEvent {
  readonly eventType: 'SampleHappened';
  readonly sequenceNumber: number;
}

const occurredAt = new Date('2026-09-30T12:00:00.000Z');

class SampleAggregate extends AggregateRoot<SampleHappened> {
  happen(sequenceNumber: number): void {
    this.recordEvent({ eventType: 'SampleHappened', occurredAt, sequenceNumber });
  }
}

describe('AggregateRoot', () => {
  it('starts without recorded events', () => {
    expect(new SampleAggregate().pullRecordedEvents()).toEqual([]);
  });

  it('returns recorded events in the order they were recorded', () => {
    const aggregate = new SampleAggregate();
    aggregate.happen(1);
    aggregate.happen(2);

    expect(aggregate.pullRecordedEvents().map((event) => event.sequenceNumber)).toEqual([1, 2]);
  });

  it('clears recorded events once they are pulled', () => {
    const aggregate = new SampleAggregate();
    aggregate.happen(1);
    aggregate.pullRecordedEvents();

    expect(aggregate.pullRecordedEvents()).toEqual([]);
  });
});
