import { Code, ConnectError, type HandlerContext, type ServiceImpl } from '@connectrpc/connect';
import { ConcurrencyConflictError } from '@fd/chassis-postgres';
import { correlationIdKey, principalOf } from '@fd/chassis-rpc';
import {
  TicketCommandFailureSchema,
  type KitchenService,
  type ListTicketsRequest,
  type ListTicketsResponse,
  type Ticket as TicketContract,
} from '@fd/contracts/fooddelivery/kitchen/v1/service_pb.js';
import { left, type Either } from '@fd/domain';
import type {
  AdvanceTicketCommand,
  AdvanceTicketError,
  TicketAdvance,
} from '#application/commands/advance-ticket/advance-ticket.command.ts';
import type { AdvanceTicketCommandHandler } from '#application/commands/advance-ticket/advance-ticket.command-handler.ts';
import type { MessageMetadata } from '#application/ports/unit-of-work.port.ts';
import type { ListTicketsQueryHandler } from '#application/queries/list-tickets/list-tickets.query-handler.ts';
import { parsePrincipal, type Principal } from '#domain/identity/principal.value-object.ts';
import { parseRestaurantId, type RestaurantId } from '#domain/ticket/restaurant-id.value-object.ts';
import type { TicketSnapshot } from '#domain/ticket/ticket.aggregate.ts';
import { parseTicketId, type TicketId } from '#domain/ticket/ticket-id.value-object.ts';
import { toTicketContract } from './kitchen-response.message-mapper.ts';

export interface KitchenRpcServiceSettings {
  readonly listTickets: ListTicketsQueryHandler;
  readonly advanceTicket: AdvanceTicketCommandHandler;
}

interface TicketAdvanceRequest {
  readonly restaurantId: string;
  readonly ticketId: string;
  readonly advance: TicketAdvance;
}

interface ConcurrentTicketChange {
  readonly type: 'ConcurrentTicketChange';
}

type KitchenRequestFailure = AdvanceTicketError | ConcurrentTicketChange;

const refusalCodes: ReadonlyMap<KitchenRequestFailure['type'], Code> = new Map([
  ['NotRestaurantMember', Code.PermissionDenied],
  ['TicketNotFound', Code.NotFound],
  ['InvalidTicketTransition', Code.FailedPrecondition],
  ['ConcurrentTicketChange', Code.Aborted],
]);

function ticketRequestFailure(failure: KitchenRequestFailure): ConnectError {
  const code = refusalCodes.get(failure.type) ?? Code.InvalidArgument;
  return new ConnectError(failure.type, code, undefined, [
    { desc: TicketCommandFailureSchema, value: { reason: failure.type } },
  ]);
}

function requestedRestaurantId(rawRestaurantId: string): RestaurantId {
  const restaurantId = parseRestaurantId(rawRestaurantId);
  if (restaurantId.isLeft()) throw new ConnectError('restaurant_id', Code.InvalidArgument);
  return restaurantId.success;
}

function requestedTicketId(rawTicketId: string): TicketId {
  const ticketId = parseTicketId(rawTicketId);
  if (ticketId.isLeft()) throw new ConnectError('ticket_id', Code.InvalidArgument);
  return ticketId.success;
}

function toMetadata(context: HandlerContext, principal: Principal): MessageMetadata {
  return {
    correlationId: context.values.get(correlationIdKey),
    causationId: undefined,
    actorId: principal.staffMemberId,
    actorType: 'restaurant_staff',
  };
}

async function advance(
  handler: AdvanceTicketCommandHandler,
  command: AdvanceTicketCommand,
): Promise<Either<KitchenRequestFailure, TicketSnapshot>> {
  try {
    return await handler.execute(command);
  } catch (error) {
    if (!(error instanceof ConcurrencyConflictError)) throw error;
    return left({ type: 'ConcurrentTicketChange' });
  }
}

async function advanceTicket(
  handler: AdvanceTicketCommandHandler,
  request: TicketAdvanceRequest,
  context: HandlerContext,
): Promise<{ readonly ticket: TicketContract }> {
  const principal = principalOf(context, parsePrincipal);
  const outcome = await advance(handler, {
    principal,
    restaurantId: requestedRestaurantId(request.restaurantId),
    ticketId: requestedTicketId(request.ticketId),
    advance: request.advance,
    metadata: toMetadata(context, principal),
  });
  if (outcome.isLeft()) throw ticketRequestFailure(outcome.failure);
  return { ticket: toTicketContract(outcome.success) };
}

async function listTickets(
  handler: ListTicketsQueryHandler,
  request: ListTicketsRequest,
  context: HandlerContext,
): Promise<Pick<ListTicketsResponse, 'tickets'>> {
  const principal = principalOf(context, parsePrincipal);
  const restaurantId = requestedRestaurantId(request.restaurantId);
  const outcome = await handler.execute({ principal, restaurantId });
  if (outcome.isLeft()) throw ticketRequestFailure(outcome.failure);
  return { tickets: outcome.success.map(toTicketContract) };
}

export function createKitchenRpcService(
  settings: KitchenRpcServiceSettings,
): ServiceImpl<typeof KitchenService> {
  return {
    listTickets: (request, context) => listTickets(settings.listTickets, request, context),

    acceptTicket: ({ restaurantId, ticketId, preparationTimeInMinutes }, context) =>
      advanceTicket(
        settings.advanceTicket,
        { restaurantId, ticketId, advance: { type: 'Accept', preparationTimeInMinutes } },
        context,
      ),

    startPreparingTicket: ({ restaurantId, ticketId }, context) =>
      advanceTicket(
        settings.advanceTicket,
        { restaurantId, ticketId, advance: { type: 'StartPreparing' } },
        context,
      ),

    markTicketReady: ({ restaurantId, ticketId }, context) =>
      advanceTicket(
        settings.advanceTicket,
        { restaurantId, ticketId, advance: { type: 'MarkReady' } },
        context,
      ),
  };
}
