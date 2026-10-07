import { setTimeout as delay } from 'node:timers/promises';
import { z } from 'zod';
import { KeycloakSignIn } from './keycloak-sign-in.adapter.ts';

const ticketSchema = z.object({
  ticketId: z.uuid(),
  orderId: z.uuid(),
  status: z.string(),
  readyBy: z.string().optional(),
});
const ticketsSchema = z.object({ tickets: z.array(ticketSchema) });
const pollIntervalInMilliseconds = 500;

export type KitchenTicket = z.infer<typeof ticketSchema>;
export type TicketStep = 'acceptance' | 'preparation' | 'readiness';

export interface TicketAddress {
  readonly restaurantId: string;
  readonly ticketId: string;
}

export class HttpKitchenApi {
  readonly #signIn: KeycloakSignIn;
  readonly #baseUrl: string;

  constructor(username: string, baseUrl = process.env['E2E_EDGE_URL'] ?? 'http://127.0.0.1:8080') {
    this.#signIn = new KeycloakSignIn(username);
    this.#baseUrl = baseUrl;
  }

  async fetchTickets(restaurantId: string): Promise<Response> {
    return fetch(`${this.#baseUrl}/v1/restaurant/restaurants/${restaurantId}/tickets`, {
      headers: await this.#authorization(),
    });
  }

  async advanceTicket(address: TicketAddress, step: TicketStep, body?: object): Promise<Response> {
    const { restaurantId, ticketId } = address;
    const path = `/v1/restaurant/restaurants/${restaurantId}/tickets/${ticketId}/${step}`;
    const contentType = body === undefined ? {} : { 'content-type': 'application/json' };
    return fetch(`${this.#baseUrl}${path}`, {
      method: 'POST',
      headers: { ...contentType, ...(await this.#authorization()) },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
  }

  async readTicket(response: Response): Promise<KitchenTicket> {
    return ticketSchema.parse(await response.json());
  }

  async waitForTicket(
    restaurantId: string,
    orderId: string,
    limitInMilliseconds = 60_000,
  ): Promise<KitchenTicket> {
    const deadlineInMilliseconds = Date.now() + limitInMilliseconds;
    let lastStatus = 'no answer';
    while (Date.now() < deadlineInMilliseconds) {
      const response = await this.fetchTickets(restaurantId);
      lastStatus = `HTTP ${String(response.status)}`;
      const listed = response.ok ? ticketsSchema.parse(await response.json()).tickets : [];
      const ticket = listed.find((candidate) => candidate.orderId === orderId);
      if (ticket !== undefined) return ticket;
      await delay(pollIntervalInMilliseconds);
    }
    throw new Error(`the ticket of order ${orderId} was not listed in time; last ${lastStatus}`);
  }

  async #authorization(): Promise<Record<string, string>> {
    return { authorization: `Bearer ${await this.#signIn.accessToken()}` };
  }
}
