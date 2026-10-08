import { describe, expect, it } from 'vitest';
import {
  acceptTicket,
  createRestaurantApi,
  listMemberships,
  listTickets,
  markTicketReady,
  problemOf,
  startPreparingTicket,
  type RestaurantApi,
  type Ticket,
} from './restaurant-api.adapter.ts';

interface Answer {
  readonly status: number;
  readonly body?: object;
}

const restaurantId = '0199a5d0-0000-7000-8000-0000000000b1';
const ticketId = '0199a5d0-0000-7000-8000-0000000000f1';
const address = { restaurantId, ticketId };
const ticketUrl = `http://kitchen.test/v1/restaurant/restaurants/${restaurantId}/tickets/${ticketId}`;
const acceptedTicket: Ticket = {
  ticketId,
  orderId: '0199a5d0-0000-7000-8000-0000000000a1',
  status: 'ACCEPTED',
  lineItems: [
    { menuItemId: '0199a5d0-0000-7000-8000-000000000102', name: 'Calabresa', quantity: 2 },
  ],
  readyBy: '2026-10-07T21:15:00.000Z',
};

class FakeEdge {
  readonly requests: Request[] = [];
  readonly #answer: Answer;

  constructor(answer: Answer) {
    this.#answer = answer;
  }

  api(): RestaurantApi {
    const api = createRestaurantApi('http://kitchen.test', 'access-token-of-staff-a');
    api.use({
      onRequest: ({ request }) => {
        this.requests.push(request.clone());
        const { status, body } = this.#answer;
        const contentType = status >= 400 ? 'application/problem+json' : 'application/json';
        const headers =
          body === undefined ? { 'content-length': '0' } : { 'content-type': contentType };
        return new Response(body === undefined ? null : JSON.stringify(body), { status, headers });
      },
    });
    return api;
  }
}

function problem(status: number, title: string, reason?: string): Answer {
  return {
    status,
    body: { type: 'about:blank', title, status, ...(reason === undefined ? {} : { reason }) },
  };
}

async function describeSent(request: Request | undefined): Promise<readonly unknown[]> {
  return [
    request?.method,
    request?.url,
    request?.headers.get('content-type'),
    await request?.text(),
  ];
}

describe('the restaurant API adapter of the kitchen display', () => {
  it('sends the access token of the staff member as a bearer token', async () => {
    const edge = new FakeEdge({ status: 200, body: { memberships: [] } });

    await listMemberships(edge.api());

    expect(edge.requests.map((request) => request.headers.get('authorization'))).toEqual([
      'Bearer access-token-of-staff-a',
    ]);
  });

  it('lists the restaurants of the staff member', async () => {
    const memberships = [{ restaurantId, restaurantName: 'Pizzaria Bella', role: 'OWNER' }];
    const edge = new FakeEdge({ status: 200, body: { memberships } });

    await expect(listMemberships(edge.api())).resolves.toEqual({ memberships });
    expect(edge.requests.map((request) => request.url)).toEqual([
      'http://kitchen.test/v1/restaurant/memberships',
    ]);
  });

  it('lists the active tickets of the restaurant', async () => {
    const edge = new FakeEdge({ status: 200, body: { tickets: [acceptedTicket] } });

    await expect(listTickets(edge.api(), restaurantId)).resolves.toEqual({
      tickets: [acceptedTicket],
    });
    expect(edge.requests.map((request) => request.url)).toEqual([
      `http://kitchen.test/v1/restaurant/restaurants/${restaurantId}/tickets`,
    ]);
  });

  it('accepts a ticket with the preparation time the staff member chose', async () => {
    const edge = new FakeEdge({ status: 200, body: acceptedTicket });

    await expect(acceptTicket(edge.api(), address, 15)).resolves.toEqual(acceptedTicket);
    expect(await describeSent(edge.requests[0])).toEqual([
      'POST',
      `${ticketUrl}/acceptance`,
      'application/json',
      '{"preparationTimeInMinutes":15}',
    ]);
  });

  it.each([
    ['starts preparing', 'preparation', startPreparingTicket],
    ['marks ready', 'readiness', markTicketReady],
  ])('%s a ticket with an empty request', async (description, step, advance) => {
    const edge = new FakeEdge({ status: 200, body: acceptedTicket });

    await expect(advance(edge.api(), address)).resolves.toEqual(acceptedTicket);
    expect(await describeSent(edge.requests[0])).toEqual([
      'POST',
      `${ticketUrl}/${step}`,
      null,
      '',
    ]);
  });

  it.each([
    {
      call: 'lists the tickets',
      send: (api: RestaurantApi) => listTickets(api, restaurantId),
      answer: problem(403, 'Forbidden', 'NotRestaurantMember'),
      expected: 'You are not a member of this restaurant.',
    },
    {
      call: 'accepts a ticket',
      send: (api: RestaurantApi) => acceptTicket(api, address, 0),
      answer: problem(400, 'Bad Request', 'InvalidPreparationTime'),
      expected: 'Enter a preparation time between 1 and 120 minutes.',
    },
    {
      call: 'starts preparing a ticket',
      send: (api: RestaurantApi) => startPreparingTicket(api, address),
      answer: problem(422, 'Unprocessable Entity', 'InvalidTicketTransition'),
      expected: 'This ticket has already moved on. The queue shows where it is now.',
    },
    {
      call: 'marks a ticket ready',
      send: (api: RestaurantApi) => markTicketReady(api, address),
      answer: problem(409, 'Conflict', 'ConcurrentTicketChange'),
      expected:
        'Someone else changed this ticket at the same time. The queue shows where it is now.',
    },
    {
      call: 'lists the memberships',
      send: (api: RestaurantApi) => listMemberships(api),
      answer: problem(404, 'Not Found', 'TicketNotFound'),
      expected: 'This ticket is no longer in the queue.',
    },
  ])('describes a refusal by its reason when it $call', async ({ send, answer, expected }) => {
    const edge = new FakeEdge(answer);

    await expect(send(edge.api())).resolves.toEqual({ problem: expected });
  });

  it.each([
    [
      'the bare 403 a consumer gets from the role check',
      problem(403, 'Forbidden'),
      'Your account may not use this kitchen.',
    ],
    [
      'a token the edge refused',
      problem(401, 'Unauthorized'),
      'Your session ended. Reload the page to sign in again.',
    ],
    ['a busy edge without a body', { status: 503 }, 'The service is busy. Try again in a moment.'],
  ])('describes %s', async (description, answer, expected) => {
    const edge = new FakeEdge(answer);

    await expect(listTickets(edge.api(), restaurantId)).resolves.toEqual({ problem: expected });
  });

  it.each([
    [
      { problem: 'This ticket is no longer in the queue.' },
      'This ticket is no longer in the queue.',
    ],
    [acceptedTicket, undefined],
    [undefined, undefined],
  ])('reads the problem of %j', (result, expected) => {
    expect(problemOf(result)).toBe(expected);
  });
});
