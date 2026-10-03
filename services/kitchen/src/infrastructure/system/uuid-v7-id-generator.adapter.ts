import { v7 as generateUuidV7 } from 'uuid';
import type { IdGenerator } from '#application/ports/id-generator.port.ts';
import { parseTicketId, type TicketId } from '#domain/ticket/ticket-id.value-object.ts';

export class UuidV7IdGenerator implements IdGenerator {
  generateTicketId(): TicketId {
    const ticketId = parseTicketId(generateUuidV7());
    if (ticketId.isLeft()) {
      throw new Error(`uuid generator produced ${ticketId.failure.rawTicketId}`);
    }
    return ticketId.success;
  }
}
