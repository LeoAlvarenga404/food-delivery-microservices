import type { DomainEvent } from './domain-event.ts';

export abstract class AggregateRoot<RecordedEvent extends DomainEvent> {
  #recordedEvents: RecordedEvent[] = [];

  protected recordEvent(event: RecordedEvent): void {
    this.#recordedEvents.push(event);
  }

  pullRecordedEvents(): readonly RecordedEvent[] {
    const pulledEvents = this.#recordedEvents;
    this.#recordedEvents = [];
    return pulledEvents;
  }
}
