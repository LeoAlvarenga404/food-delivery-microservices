import { timestampDate } from '@bufbuild/protobuf/wkt';
import {
  Code,
  ConnectError,
  createClient,
  createRouterTransport,
  type Client,
  type Interceptor,
} from '@connectrpc/connect';
import { createAccessTokenInterceptor, type AccessTokenVerifier } from '@fd/chassis-auth';
import { createLogger } from '@fd/chassis-observability';
import { ConcurrencyConflictError } from '@fd/chassis-postgres';
import { createRpcCorrelation } from '@fd/chassis-rpc';
import {
  KitchenService,
  TicketCommandFailureSchema,
  TicketStatus,
} from '@fd/contracts/fooddelivery/kitchen/v1/service_pb.js';
import { left, right } from '@fd/domain';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { FakeClock } from '../../../test/support/clock.fake.ts';
import { InMemoryRestaurantMembershipRepository } from '../../../test/support/in-memory-restaurant-membership.repository.ts';
import { InMemoryUnitOfWork } from '../../../test/support/in-memory-unit-of-work.adapter.ts';
import {
  pizzeriaMembership,
  staffAId,
  staffBId,
} from '../../../test/support/restaurant-membership.builder.ts';
import {
  acceptedAt,
  buildTicketIn,
  orderId,
  readyBy,
  restaurantId,
  ticketId,
} from '../../../test/support/ticket.builder.ts';
import { AdvanceTicketCommandHandler } from '#application/commands/advance-ticket/advance-ticket.command-handler.ts';
import { ListTicketsQueryHandler } from '#application/queries/list-tickets/list-tickets.query-handler.ts';
import { createKitchenRpcService } from './kitchen.rpc-service.ts';

const callerCorrelationId = '0199a5d0-0000-7000-8000-0000000000f2';
const verifiedAccessTokens = new Map([
  ['staff-a-token', { subject: staffAId, roles: ['restaurant_staff'] }],
  ['staff-b-token', { subject: staffBId, roles: ['restaurant_staff'] }],
  ['consumer-token', { subject: '0199a5d0-0000-7000-8000-0000000000c1', roles: ['consumer'] }],
]);
const ticketRequest = { restaurantId, ticketId };

let unitOfWork: InMemoryUnitOfWork;
let advanceTicket: AdvanceTicketCommandHandler;

const verify: AccessTokenVerifier = (accessToken) => {
  const verified = verifiedAccessTokens.get(accessToken);
  return Promise.resolve(
    verified === undefined
      ? left({ type: 'InvalidAccessToken', reason: 'ERR_JWS_INVALID' })
      : right(verified),
  );
};

function sendingAccessToken(accessToken: string): Interceptor {
  return (next) => (request) => {
    request.header.set('authorization', `Bearer ${accessToken}`);
    return next(request);
  };
}

function clientFor(accessToken: string): Client<typeof KitchenService> {
  const correlation = createRpcCorrelation({
    logger: createLogger({ serviceName: 'kitchen-service', level: 'silent' }),
    generateCorrelationId: () => '0199a5d0-0000-7000-8000-0000000000f9',
  });
  const memberships = new InMemoryRestaurantMembershipRepository([pizzeriaMembership]);
  const transport = createRouterTransport(
    ({ service }) => {
      service(
        KitchenService,
        createKitchenRpcService({
          listTickets: new ListTicketsQueryHandler({ tickets: unitOfWork.tickets, memberships }),
          advanceTicket,
        }),
      );
    },
    {
      router: { interceptors: [correlation, createAccessTokenInterceptor(verify)] },
      transport: { interceptors: [sendingAccessToken(accessToken)] },
    },
  );
  return createClient(KitchenService, transport);
}

async function rejectionOf(call: Promise<unknown>): Promise<ConnectError> {
  return ConnectError.from(
    await call.then(
      () => undefined,
      (rejection: unknown) => rejection,
    ),
  );
}

function reasonOf(error: ConnectError): string | undefined {
  return error.findDetails(TicketCommandFailureSchema)[0]?.reason;
}

beforeEach(async () => {
  unitOfWork = new InMemoryUnitOfWork();
  await unitOfWork.tickets.save(buildTicketIn({ status: 'AWAITING_ACCEPTANCE' }));
  advanceTicket = new AdvanceTicketCommandHandler({
    unitOfWork,
    memberships: new InMemoryRestaurantMembershipRepository([pizzeriaMembership]),
    clock: new FakeClock(acceptedAt),
  });
});

describe('KitchenService', () => {
  it('lists the active tickets of the restaurant with their lines', async () => {
    const response = await clientFor('staff-a-token').listTickets({ restaurantId });

    expect(response.tickets).toMatchObject([
      {
        ticketId,
        orderId,
        restaurantId,
        status: TicketStatus.AWAITING_ACCEPTANCE,
        lineItems: [
          { name: 'Margherita', quantity: 2 },
          { name: 'Guarana', quantity: 1 },
        ],
      },
    ]);
    expect(response.tickets[0]?.readyBy).toBeUndefined();
  });

  it('accepts a ticket ready by the preparation time, acting as the staff member of the token', async () => {
    const response = await clientFor('staff-a-token').acceptTicket(
      { ...ticketRequest, preparationTimeInMinutes: 40 },
      { headers: { 'x-correlation-id': callerCorrelationId } },
    );

    expect(response.ticket?.status).toBe(TicketStatus.ACCEPTED);
    expect(response.ticket?.readyBy && timestampDate(response.ticket.readyBy)).toEqual(
      new Date('2026-10-06T18:40:00.000Z'),
    );
    expect(unitOfWork.executedMetadata).toEqual([
      {
        correlationId: callerCorrelationId,
        causationId: undefined,
        actorId: staffAId,
        actorType: 'restaurant_staff',
      },
    ]);
  });

  it('starts preparing an accepted ticket and marks it ready, keeping its ready-by time', async () => {
    const client = clientFor('staff-a-token');
    await client.acceptTicket({ ...ticketRequest, preparationTimeInMinutes: 15 });

    const preparing = await client.startPreparingTicket(ticketRequest);
    const ready = await client.markTicketReady(ticketRequest);

    expect([preparing.ticket?.status, ready.ticket?.status]).toEqual([
      TicketStatus.PREPARING,
      TicketStatus.READY_FOR_PICKUP,
    ]);
    expect(ready.ticket?.readyBy && timestampDate(ready.ticket.readyBy)).toEqual(readyBy);
  });

  it.each([
    {
      refusal: 'a staff member who is not a member listing',
      call: (client: Client<typeof KitchenService>) => client.listTickets({ restaurantId }),
      accessToken: 'staff-b-token',
      code: Code.PermissionDenied,
      reason: 'NotRestaurantMember',
    },
    {
      refusal: 'a staff member who is not a member accepting',
      call: (client: Client<typeof KitchenService>) =>
        client.acceptTicket({ ...ticketRequest, preparationTimeInMinutes: 15 }),
      accessToken: 'staff-b-token',
      code: Code.PermissionDenied,
      reason: 'NotRestaurantMember',
    },
    {
      refusal: 'an unknown ticket',
      call: (client: Client<typeof KitchenService>) =>
        client.startPreparingTicket({ restaurantId, ticketId: orderId }),
      accessToken: 'staff-a-token',
      code: Code.NotFound,
      reason: 'TicketNotFound',
    },
    {
      refusal: 'a preparation time of zero',
      call: (client: Client<typeof KitchenService>) =>
        client.acceptTicket({ ...ticketRequest, preparationTimeInMinutes: 0 }),
      accessToken: 'staff-a-token',
      code: Code.InvalidArgument,
      reason: 'InvalidPreparationTime',
    },
    {
      refusal: 'a ticket marked ready before it was prepared',
      call: (client: Client<typeof KitchenService>) => client.markTicketReady(ticketRequest),
      accessToken: 'staff-a-token',
      code: Code.FailedPrecondition,
      reason: 'InvalidTicketTransition',
    },
  ])('refuses $refusal with its reason', async ({ call, accessToken, code, reason }) => {
    const error = await rejectionOf(call(clientFor(accessToken)));

    expect(error.code).toBe(code);
    expect(reasonOf(error)).toBe(reason);
  });

  it('refuses to accept a ticket twice with the reason the second time', async () => {
    const client = clientFor('staff-a-token');
    await client.acceptTicket({ ...ticketRequest, preparationTimeInMinutes: 15 });

    const error = await rejectionOf(
      client.acceptTicket({ ...ticketRequest, preparationTimeInMinutes: 15 }),
    );

    expect([error.code, reasonOf(error)]).toEqual([
      Code.FailedPrecondition,
      'InvalidTicketTransition',
    ]);
  });

  it.each([
    {
      call: 'ListTickets',
      send: (client: Client<typeof KitchenService>) => client.listTickets({ restaurantId }),
    },
    {
      call: 'AcceptTicket',
      send: (client: Client<typeof KitchenService>) =>
        client.acceptTicket({ ...ticketRequest, preparationTimeInMinutes: 15 }),
    },
    {
      call: 'StartPreparingTicket',
      send: (client: Client<typeof KitchenService>) => client.startPreparingTicket(ticketRequest),
    },
    {
      call: 'MarkTicketReady',
      send: (client: Client<typeof KitchenService>) => client.markTicketReady(ticketRequest),
    },
  ])('refuses $call to a caller without the restaurant staff role', async ({ send }) => {
    const error = await rejectionOf(send(clientFor('consumer-token')));

    expect([error.code, error.rawMessage]).toEqual([
      Code.PermissionDenied,
      'MissingRestaurantStaffRole',
    ]);
  });

  it('refuses a restaurant id that is not a uuid as an invalid argument', async () => {
    const error = await rejectionOf(clientFor('staff-a-token').listTickets({ restaurantId: 'x' }));

    expect(error.code).toBe(Code.InvalidArgument);
  });

  it('answers a ticket changed by someone else meanwhile as aborted, so the display reloads', async () => {
    vi.spyOn(advanceTicket, 'execute').mockRejectedValue(
      new ConcurrencyConflictError(`ticket ${ticketId} changed after version 1`),
    );

    const error = await rejectionOf(clientFor('staff-a-token').startPreparingTicket(ticketRequest));

    expect([error.code, reasonOf(error)]).toEqual([Code.Aborted, 'ConcurrentTicketChange']);
  });
});
