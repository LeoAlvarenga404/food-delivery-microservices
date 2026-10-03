import type { TicketId } from '#domain/ticket/ticket-id.value-object.ts';

export interface IdGenerator {
  generateTicketId(): TicketId;
}
