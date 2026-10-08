import { AggregateRoot, left, right, type Either } from '@fd/domain';
import type { ConsumerId } from './consumer-id.value-object.ts';
import type { MenuItemId } from './menu-item-id.value-object.ts';
import type { OrderId } from './order-id.value-object.ts';
import type { PreparationTimeInMinutes } from './preparation-time.value-object.ts';
import type { RestaurantId } from './restaurant-id.value-object.ts';
import type { TicketAccepted } from './ticket-accepted.event.ts';
import type { TicketPreparationStarted } from './ticket-preparation-started.event.ts';
import type { TicketReadyForPickup } from './ticket-ready-for-pickup.event.ts';
import type { InvalidTicketTransition, TicketCreationError } from './ticket.errors.ts';
import type { TicketId } from './ticket-id.value-object.ts';
import type { TicketState, TicketStatus } from './ticket.state.ts';

export type TicketEvent = TicketAccepted | TicketPreparationStarted | TicketReadyForPickup;

export interface TicketLineItem {
  readonly menuItemId: MenuItemId;
  readonly name: string;
  readonly quantity: number;
}

export interface CreateTicketInput {
  readonly ticketId: TicketId;
  readonly orderId: OrderId;
  readonly restaurantId: RestaurantId;
  readonly consumerId: ConsumerId;
  readonly lineItems: readonly TicketLineItem[];
}

export interface TicketSnapshot extends CreateTicketInput {
  readonly state: TicketState;
  readonly version: number;
}

interface TicketReferences {
  readonly ticketId: TicketId;
  readonly orderId: OrderId;
  readonly restaurantId: RestaurantId;
}

const minuteInMilliseconds = 60_000;

function findInvalidQuantity(lineItems: readonly TicketLineItem[]): TicketLineItem | undefined {
  return lineItems.find(({ quantity }) => !Number.isInteger(quantity) || quantity <= 0);
}

export class Ticket extends AggregateRoot<TicketEvent> {
  readonly #content: CreateTicketInput;
  readonly #version: number;
  #state: TicketState;

  private constructor(snapshot: TicketSnapshot) {
    super();
    const { state, version, ...content } = snapshot;
    this.#content = content;
    this.#state = state;
    this.#version = version;
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
    return right(new Ticket({ ...input, state: { status: 'CREATE_PENDING' }, version: 0 }));
  }

  static restore(snapshot: TicketSnapshot): Ticket {
    return new Ticket(snapshot);
  }

  approve(): Either<InvalidTicketTransition, undefined> {
    if (this.#state.status !== 'CREATE_PENDING') {
      return left(this.#invalidTransition('AWAITING_ACCEPTANCE'));
    }
    this.#state = { status: 'AWAITING_ACCEPTANCE' };
    return right(undefined);
  }

  reject(): Either<InvalidTicketTransition, undefined> {
    if (this.#state.status !== 'CREATE_PENDING') return left(this.#invalidTransition('REJECTED'));
    this.#state = { status: 'REJECTED' };
    return right(undefined);
  }

  accept(
    preparationTime: PreparationTimeInMinutes,
    acceptedAt: Date,
  ): Either<InvalidTicketTransition, undefined> {
    if (this.#state.status !== 'AWAITING_ACCEPTANCE') {
      return left(this.#invalidTransition('ACCEPTED'));
    }
    const readyBy = new Date(acceptedAt.getTime() + preparationTime * minuteInMilliseconds);
    this.#state = { status: 'ACCEPTED', acceptedAt, readyBy };
    this.recordEvent({
      eventType: 'TicketAccepted',
      occurredAt: acceptedAt,
      ...this.#references(),
      readyBy,
    });
    return right(undefined);
  }

  startPreparing(startedAt: Date): Either<InvalidTicketTransition, undefined> {
    const state = this.#state;
    if (state.status !== 'ACCEPTED') return left(this.#invalidTransition('PREPARING'));
    this.#state = { ...state, status: 'PREPARING' };
    this.recordEvent({
      eventType: 'TicketPreparationStarted',
      occurredAt: startedAt,
      ...this.#references(),
    });
    return right(undefined);
  }

  markReady(readyAt: Date): Either<InvalidTicketTransition, undefined> {
    const state = this.#state;
    if (state.status !== 'PREPARING') return left(this.#invalidTransition('READY_FOR_PICKUP'));
    this.#state = { ...state, status: 'READY_FOR_PICKUP' };
    this.recordEvent({
      eventType: 'TicketReadyForPickup',
      occurredAt: readyAt,
      ...this.#references(),
    });
    return right(undefined);
  }

  toSnapshot(): TicketSnapshot {
    return { ...this.#content, state: this.#state, version: this.#version };
  }

  #references(): TicketReferences {
    const { ticketId, orderId, restaurantId } = this.#content;
    return { ticketId, orderId, restaurantId };
  }

  #invalidTransition(to: TicketStatus): InvalidTicketTransition {
    return {
      type: 'InvalidTicketTransition',
      ticketId: this.#content.ticketId,
      from: this.#state.status,
      to,
    };
  }
}
