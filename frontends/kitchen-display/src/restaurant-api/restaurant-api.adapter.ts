import createClient, { type Client } from 'openapi-fetch';
import type { paths } from '../generated/restaurant-api.ts';
import { describeProblem } from './restaurant-api-view.message-mapper.ts';

export type RestaurantApi = Client<paths>;

export type Memberships =
  paths['/v1/restaurant/memberships']['get']['responses'][200]['content']['application/json'];

export type Tickets =
  paths['/v1/restaurant/restaurants/{restaurantId}/tickets']['get']['responses'][200]['content']['application/json'];

export type Ticket = Tickets['tickets'][number];

export interface TicketAddress {
  readonly restaurantId: string;
  readonly ticketId: string;
}

export interface Refusal {
  readonly problem: string;
}

type Problem = { readonly reason?: string } | undefined;

function toRefusal(response: Response, problem: Problem): Refusal {
  return { problem: describeProblem(response.status, problem?.reason) };
}

export function problemOf(result: object | undefined): string | undefined {
  if (result === undefined || !('problem' in result)) return undefined;
  return typeof result.problem === 'string' ? result.problem : undefined;
}

export function createRestaurantApi(baseUrl: string, accessToken: string): RestaurantApi {
  return createClient<paths>({ baseUrl, headers: { authorization: `Bearer ${accessToken}` } });
}

export async function listMemberships(api: RestaurantApi): Promise<Memberships | Refusal> {
  const { data: memberships, error, response } = await api.GET('/v1/restaurant/memberships');
  return memberships ?? toRefusal(response, error);
}

export async function listTickets(
  api: RestaurantApi,
  restaurantId: string,
): Promise<Tickets | Refusal> {
  const {
    data: tickets,
    error,
    response,
  } = await api.GET('/v1/restaurant/restaurants/{restaurantId}/tickets', {
    params: { path: { restaurantId } },
  });
  return tickets ?? toRefusal(response, error);
}

export async function acceptTicket(
  api: RestaurantApi,
  address: TicketAddress,
  preparationTimeInMinutes: number,
): Promise<Ticket | Refusal> {
  const {
    data: ticket,
    error,
    response,
  } = await api.POST('/v1/restaurant/restaurants/{restaurantId}/tickets/{ticketId}/acceptance', {
    params: { path: address },
    body: { preparationTimeInMinutes },
  });
  return ticket ?? toRefusal(response, error);
}

export async function startPreparingTicket(
  api: RestaurantApi,
  address: TicketAddress,
): Promise<Ticket | Refusal> {
  const {
    data: ticket,
    error,
    response,
  } = await api.POST('/v1/restaurant/restaurants/{restaurantId}/tickets/{ticketId}/preparation', {
    params: { path: address },
  });
  return ticket ?? toRefusal(response, error);
}

export async function markTicketReady(
  api: RestaurantApi,
  address: TicketAddress,
): Promise<Ticket | Refusal> {
  const {
    data: ticket,
    error,
    response,
  } = await api.POST('/v1/restaurant/restaurants/{restaurantId}/tickets/{ticketId}/readiness', {
    params: { path: address },
  });
  return ticket ?? toRefusal(response, error);
}
