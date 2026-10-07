import type { Client } from '@connectrpc/connect';
import type { KitchenService } from '@fd/contracts/fooddelivery/kitchen/v1/service_pb.js';
import type { FastifyPluginCallbackZod } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { problemDetailsSchema } from '../http/problem-details.adapter.ts';
import {
  requireServiceAccess,
  serviceCallOptions,
  type RoutesServer,
  type ServiceAccess,
} from '../http/service-access.adapter.ts';
import { ticketsViewSchema, ticketViewSchema, toTicketView } from './ticket-view.message-mapper.ts';

export interface TicketRoutesSettings {
  readonly kitchenService: Client<typeof KitchenService>;
  readonly serviceAccess: ServiceAccess;
}

const problemResponse = {
  content: { 'application/problem+json': { schema: problemDetailsSchema } },
};
const problemResponses = { '4xx': problemResponse, '5xx': problemResponse };
const kitchenServiceAudience = 'kitchen-service';
const ticketsPath = '/v1/restaurant/restaurants/:restaurantId/tickets';
const ticketParams = z.object({ restaurantId: z.uuid(), ticketId: z.uuid() });

const listTicketsSchema = {
  params: z.object({ restaurantId: z.uuid() }),
  response: { 200: ticketsViewSchema, ...problemResponses },
};

const acceptTicketSchema = {
  params: ticketParams,
  body: z.object({ preparationTimeInMinutes: z.int() }),
  response: { 200: ticketViewSchema, ...problemResponses },
};

const advanceTicketSchema = {
  params: ticketParams,
  response: { 200: ticketViewSchema, ...problemResponses },
};

function registerListTickets(server: RoutesServer, settings: TicketRoutesSettings): void {
  server.get(ticketsPath, { schema: listTicketsSchema }, async (request) => {
    const { tickets } = await settings.kitchenService.listTickets(
      { restaurantId: request.params.restaurantId },
      serviceCallOptions(request),
    );
    return { tickets: tickets.map(toTicketView) };
  });
}

function registerAcceptTicket(server: RoutesServer, settings: TicketRoutesSettings): void {
  const path = `${ticketsPath}/:ticketId/acceptance`;
  server.post(path, { schema: acceptTicketSchema }, async (request) => {
    const { ticket } = await settings.kitchenService.acceptTicket(
      { ...request.params, preparationTimeInMinutes: request.body.preparationTimeInMinutes },
      serviceCallOptions(request),
    );
    return toTicketView(ticket);
  });
}

function registerStartPreparingTicket(server: RoutesServer, settings: TicketRoutesSettings): void {
  const path = `${ticketsPath}/:ticketId/preparation`;
  server.post(path, { schema: advanceTicketSchema }, async (request) => {
    const { ticket } = await settings.kitchenService.startPreparingTicket(
      request.params,
      serviceCallOptions(request),
    );
    return toTicketView(ticket);
  });
}

function registerMarkTicketReady(server: RoutesServer, settings: TicketRoutesSettings): void {
  const path = `${ticketsPath}/:ticketId/readiness`;
  server.post(path, { schema: advanceTicketSchema }, async (request) => {
    const { ticket } = await settings.kitchenService.markTicketReady(
      request.params,
      serviceCallOptions(request),
    );
    return toTicketView(ticket);
  });
}

export const ticketRoutes: FastifyPluginCallbackZod<TicketRoutesSettings> = (
  server,
  settings,
  done,
) => {
  requireServiceAccess(server, settings.serviceAccess, kitchenServiceAudience);
  registerListTickets(server, settings);
  registerAcceptTicket(server, settings);
  registerStartPreparingTicket(server, settings);
  registerMarkTicketReady(server, settings);
  done();
};
