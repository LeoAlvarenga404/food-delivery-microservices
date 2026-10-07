import { create } from '@bufbuild/protobuf';
import { Code, ConnectError } from '@connectrpc/connect';
import { createLogger } from '@fd/chassis-observability';
import {
  TicketCommandFailureSchema,
  TicketSchema,
  TicketStatus,
} from '@fd/contracts/fooddelivery/kitchen/v1/service_pb.js';
import type { LightMyRequestResponse } from 'fastify';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  acceptedTicket,
  awaitingTicket,
  FakeKitchenService,
  kitchenRestaurantId,
  listedTicketId,
} from '../../test/support/kitchen-service.fake.ts';
import { FakeRestaurantService } from '../../test/support/restaurant-service.fake.ts';
import { fakeServiceAccess } from '../../test/support/service-access.fake.ts';
import { createRestaurantBffServer, type RestaurantBffServer } from '../main.ts';

const callerCorrelationId = '0199a5d0-0000-7000-8000-0000000000f2';
const staffAuthorization = { authorization: 'Bearer staff-token' };
const ticketsPath = `/v1/restaurant/restaurants/${kitchenRestaurantId}/tickets`;
const ticketPath = `${ticketsPath}/${listedTicketId}`;
const awaitingView = {
  ticketId: listedTicketId,
  orderId: '0199a5d0-0000-7000-8000-0000000000a1',
  status: 'AWAITING_ACCEPTANCE',
  lineItems: [
    { menuItemId: '0199a5d0-0000-7000-8000-000000000d01', name: 'Margherita', quantity: 2 },
  ],
};
const acceptedView = { ...awaitingView, status: 'ACCEPTED', readyBy: '2026-10-06T18:15:00.000Z' };

let kitchenService: FakeKitchenService;
let server: RestaurantBffServer;

function post(
  path: string,
  headers: Record<string, string>,
  body?: Record<string, unknown>,
): Promise<LightMyRequestResponse> {
  return server.inject({
    method: 'POST',
    url: path,
    headers,
    ...(body === undefined ? {} : { payload: body }),
  });
}

function accept(
  body: Record<string, unknown> = { preparationTimeInMinutes: 15 },
): Promise<LightMyRequestResponse> {
  return post(`${ticketPath}/acceptance`, staffAuthorization, body);
}

function refusal(code: Code, reason: string): ConnectError {
  return new ConnectError('refused', code, undefined, [
    { desc: TicketCommandFailureSchema, value: { reason } },
  ]);
}

beforeEach(async () => {
  kitchenService = new FakeKitchenService();
  server = await createRestaurantBffServer({
    restaurantService: new FakeRestaurantService().client(),
    kitchenService: kitchenService.client(),
    serviceAccess: fakeServiceAccess,
    logger: createLogger({ serviceName: 'restaurant-bff', level: 'silent' }),
    generateCorrelationId: () => '0199a5d0-0000-7000-8000-0000000000f9',
  });
});

afterEach(() => server.close());

describe('GET /v1/restaurant/restaurants/:restaurantId/tickets', () => {
  it('lists the tickets of the restaurant with the kitchen service token', async () => {
    const response = await server.inject({
      method: 'GET',
      url: ticketsPath,
      headers: { ...staffAuthorization, 'x-correlation-id': callerCorrelationId },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ tickets: [awaitingView] });
    expect(kitchenService.listedRestaurantIds).toEqual([kitchenRestaurantId]);
    expect(kitchenService.receivedAuthorizations).toEqual(['Bearer kitchen-service-token']);
    expect(kitchenService.receivedCorrelationIds).toEqual([callerCorrelationId]);
  });

  it('answers a ticket in a status the kitchen does not show with an internal problem', async () => {
    kitchenService.tickets = [
      create(TicketSchema, { ...awaitingTicket, status: TicketStatus.UNSPECIFIED }),
    ];

    const response = await server.inject({
      method: 'GET',
      url: ticketsPath,
      headers: staffAuthorization,
    });

    expect(response.statusCode).toBe(500);
  });
});

describe('POST /v1/restaurant/restaurants/:restaurantId/tickets/:ticketId steps', () => {
  it('accepts a ticket with its preparation time and answers it with its ready-by time', async () => {
    const response = await accept({ preparationTimeInMinutes: 25 });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual(acceptedView);
    expect(kitchenService.acceptTicketRequests).toMatchObject([
      { restaurantId: kitchenRestaurantId, ticketId: listedTicketId, preparationTimeInMinutes: 25 },
    ]);
    expect(kitchenService.receivedAuthorizations).toEqual(['Bearer kitchen-service-token']);
  });

  it.each([
    {
      step: 'preparation',
      status: TicketStatus.PREPARING,
      statusName: 'PREPARING',
      requests: () => kitchenService.startPreparingTicketRequests,
    },
    {
      step: 'readiness',
      status: TicketStatus.READY_FOR_PICKUP,
      statusName: 'READY_FOR_PICKUP',
      requests: () => kitchenService.markTicketReadyRequests,
    },
  ])(
    'sends the $step of a ticket without a body',
    async ({ step, status, statusName, requests }) => {
      kitchenService.answeredTicket = create(TicketSchema, { ...acceptedTicket, status });

      const response = await post(`${ticketPath}/${step}`, staffAuthorization);

      expect(response.statusCode).toBe(200);
      expect(response.json()).toEqual({ ...acceptedView, status: statusName });
      expect(requests()).toMatchObject([
        { restaurantId: kitchenRestaurantId, ticketId: listedTicketId },
      ]);
    },
  );

  it.each([
    { code: Code.PermissionDenied, reason: 'NotRestaurantMember', status: 403, title: 'Forbidden' },
    { code: Code.NotFound, reason: 'TicketNotFound', status: 404, title: 'Not Found' },
    {
      code: Code.InvalidArgument,
      reason: 'InvalidPreparationTime',
      status: 400,
      title: 'Bad Request',
    },
    {
      code: Code.FailedPrecondition,
      reason: 'InvalidTicketTransition',
      status: 422,
      title: 'Unprocessable Entity',
    },
    { code: Code.Aborted, reason: 'ConcurrentTicketChange', status: 409, title: 'Conflict' },
  ])(
    'answers a $reason refusal with a $status problem naming the reason',
    async ({ code, reason, status, title }) => {
      kitchenService.failure = refusal(code, reason);

      const response = await accept();

      expect(response.statusCode).toBe(status);
      expect(response.json()).toEqual({ type: 'about:blank', title, status, reason });
    },
  );

  it.each([
    { scenario: 'without a token', headers: {}, status: 401 },
    {
      scenario: 'with the token of a consumer',
      headers: { authorization: 'Bearer consumer-token' },
      status: 403,
    },
  ])(
    'answers a step $scenario with $status before calling the kitchen service',
    async ({ headers, status }) => {
      const response = await post(`${ticketPath}/preparation`, headers);

      expect(response.statusCode).toBe(status);
      expect(kitchenService.receivedCorrelationIds).toEqual([]);
    },
  );

  it.each([
    { invalidPart: 'no preparation time', body: {} },
    { invalidPart: 'a preparation time in text', body: { preparationTimeInMinutes: '15' } },
    { invalidPart: 'a fractional preparation time', body: { preparationTimeInMinutes: 7.5 } },
  ])(
    'answers an acceptance with $invalidPart with a bad request without calling the kitchen service',
    async ({ body }) => {
      const response = await accept(body);

      expect(response.statusCode).toBe(400);
      expect(kitchenService.receivedCorrelationIds).toEqual([]);
    },
  );

  it('answers a ticket id that is not a uuid with a bad request problem', async () => {
    const response = await post(`${ticketsPath}/ticket-1/readiness`, staffAuthorization);

    expect(response.statusCode).toBe(400);
    expect(kitchenService.receivedCorrelationIds).toEqual([]);
  });
});
