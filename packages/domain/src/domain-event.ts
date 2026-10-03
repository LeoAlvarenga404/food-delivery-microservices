export interface DomainEvent {
  readonly eventType: string;
  readonly occurredAt: Date;
}
