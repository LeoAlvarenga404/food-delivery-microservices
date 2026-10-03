import { left, right, type Either } from '@fd/domain';
import type { OrderId } from './order-id.value-object.ts';
import type { InvalidTicketTransition, TicketCreationError } from './ticket.errors.ts';
import type { TicketId } from './ticket-id.value-object.ts';
import type { TicketStatus } from './ticket.state.ts';

export interface TicketLineItem {
  readonly menuItemId: string;
  readonly name: string;
  readonly quantity: number;
}

export interface CreateTicketInput {
  readonly ticketId: TicketId;
  readonly orderId: OrderId;
  readonly restaurantId: string;
  readonly lineItems: readonly TicketLineItem[];
}

export interface TicketSnapshot extends CreateTicketInput {
  readonly status: TicketStatus;
  readonly version: number;
}

function findInvalidQuantity(lineItems: readonly TicketLineItem[]): TicketLineItem | undefined {
  return lineItems.find(({ quantity }) => !Number.isInteger(quantity) || quantity <= 0);
}

export class Ticket {
  readonly #ticketId: TicketId;
  readonly #orderId: OrderId;
  readonly #restaurantId: string;
  readonly #lineItems: readonly TicketLineItem[];
  readonly #version: number;
  #status: TicketStatus;

  private constructor(snapshot: TicketSnapshot) {
    this.#ticketId = snapshot.ticketId;
    this.#orderId = snapshot.orderId;
    this.#restaurantId = snapshot.restaurantId;
    this.#lineItems = snapshot.lineItems;
    this.#status = snapshot.status;
    this.#version = snapshot.version;
  }

  static create(input: CreateTicketInput): Either<TicketCreationError, Ticket> {
    if (input.lineItems.length === 0) return left({ type: 'EmptyTicket', orderId: input.orderId });
    const invalid = findInvalidQuantity(input.lineItems);
    if (invalid !== undefined) {
      return left({
        type: 'InvalidQuantity',
        menuItemId: invalid.menuItemId,
        quantity: invalid.quantity,
      });
    }
    return right(new Ticket({ ...input, status: 'CREATE_PENDING', version: 0 }));
  }

  static restore(snapshot: TicketSnapshot): Ticket {
    return new Ticket(snapshot);
  }

  approve(): Either<InvalidTicketTransition, undefined> {
    if (this.#status !== 'CREATE_PENDING') {
      return left({
        type: 'InvalidTicketTransition',
        ticketId: this.#ticketId,
        from: this.#status,
        to: 'AWAITING_ACCEPTANCE',
      });
    }
    this.#status = 'AWAITING_ACCEPTANCE';
    return right(undefined);
  }

  toSnapshot(): TicketSnapshot {
    return {
      ticketId: this.#ticketId,
      orderId: this.#orderId,
      restaurantId: this.#restaurantId,
      lineItems: this.#lineItems,
      status: this.#status,
      version: this.#version,
    };
  }
}
