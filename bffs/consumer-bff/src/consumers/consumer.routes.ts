import type { Client } from '@connectrpc/connect';
import type { ConsumerService } from '@fd/contracts/fooddelivery/consumer/v1/service_pb.js';
import type { FastifyPluginCallbackZod } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { problemDetailsSchema } from '../http/problem-details.adapter.ts';
import {
  requireServiceAccess,
  serviceCallOptions,
  type RoutesServer,
  type ServiceAccess,
} from '../http/service-access.adapter.ts';
import {
  addressSchema,
  consumerViewSchema,
  toConsumerView,
} from './consumer-view.message-mapper.ts';

export interface ConsumerRoutesSettings {
  readonly consumerService: Client<typeof ConsumerService>;
  readonly serviceAccess: ServiceAccess;
}

const problemResponse = {
  content: { 'application/problem+json': { schema: problemDetailsSchema } },
};
const problemResponses = { '4xx': problemResponse, '5xx': problemResponse };
const consumerServiceAudience = 'consumer-service';
const ownConsumerPath = '/v1/consumers/me';

const registerConsumerSchema = {
  body: z.object({
    name: z.string(),
    email: z.string(),
    addresses: z.array(addressSchema),
  }),
  response: { 201: z.object({ consumerId: z.uuid() }), ...problemResponses },
};

const getConsumerSchema = {
  response: { 200: consumerViewSchema, ...problemResponses },
};

function registerRegisterConsumer(server: RoutesServer, settings: ConsumerRoutesSettings): void {
  server.post(ownConsumerPath, { schema: registerConsumerSchema }, async (request, reply) => {
    const { name, email, addresses } = request.body;
    const registered = await settings.consumerService.registerConsumer(
      {
        name,
        email,
        addresses: addresses.map(({ street, number, city, postalCode }) => ({
          street,
          number,
          city,
          postalCode,
        })),
      },
      serviceCallOptions(request),
    );
    return reply
      .code(201)
      .header('location', ownConsumerPath)
      .send({ consumerId: registered.consumerId });
  });
}

function registerGetConsumer(server: RoutesServer, settings: ConsumerRoutesSettings): void {
  server.get(ownConsumerPath, { schema: getConsumerSchema }, async (request) => {
    const consumer = await settings.consumerService.getConsumer({}, serviceCallOptions(request));
    return toConsumerView(consumer);
  });
}

export const consumerRoutes: FastifyPluginCallbackZod<ConsumerRoutesSettings> = (
  server,
  settings,
  done,
) => {
  requireServiceAccess(server, settings.serviceAccess, consumerServiceAudience);
  registerRegisterConsumer(server, settings);
  registerGetConsumer(server, settings);
  done();
};
