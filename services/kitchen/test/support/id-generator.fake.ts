import type { IdGenerator } from '#application/ports/id-generator.port.ts';
import { parseTicketId, type TicketId } from '#domain/ticket/ticket-id.value-object.ts';
import { unwrap } from './ticket.builder.ts';

export class FakeIdGenerator implements IdGenerator {
  #ticketCount = 0;

  generateTicketId(): TicketId {
    this.#ticketCount += 1;
    const sequence = (0xf0 + this.#ticketCount).toString(16).padStart(12, '0');
    return unwrap(parseTicketId(`0199a5d0-0000-7000-8000-${sequence}`));
  }
}
