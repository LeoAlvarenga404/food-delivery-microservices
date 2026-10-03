export interface OutboxMessage {
  readonly topic: string;
  readonly aggregateType: string;
  readonly aggregateId: string;
  readonly messageType: string;
  readonly payload: Uint8Array;
  readonly sagaId: string | undefined;
}

export interface MessageMetadata {
  readonly correlationId: string;
  readonly causationId: string | undefined;
  readonly actorId: string | undefined;
  readonly actorType: string | undefined;
}
