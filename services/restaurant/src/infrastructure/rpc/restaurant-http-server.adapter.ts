import type { ServiceImpl } from '@connectrpc/connect';
import { fastifyConnectPlugin } from '@connectrpc/connect-fastify';
import type { Logger } from '@fd/chassis-observability';
import { createRpcCorrelation, createServiceRpcInterceptors } from '@fd/chassis-rpc';
import { RestaurantCatalogueService } from '@fd/contracts/fooddelivery/restaurant/v1/catalogue_pb.js';
import { RestaurantService } from '@fd/contracts/fooddelivery/restaurant/v1/service_pb.js';
import { fastify, type FastifyInstance } from 'fastify';
import { v7 as generateUuidV7 } from 'uuid';
import type { RestaurantServiceConfiguration } from '#infrastructure/restaurant-service.config.ts';

export interface RestaurantHttpServerSettings {
  readonly configuration: RestaurantServiceConfiguration;
  readonly logger: Logger;
  readonly restaurantService: ServiceImpl<typeof RestaurantService>;
  readonly catalogueService: ServiceImpl<typeof RestaurantCatalogueService>;
}

export interface RunningHttpServer {
  readonly server: FastifyInstance;
  readonly url: string;
}

async function registerRpcServices(
  server: FastifyInstance,
  settings: RestaurantHttpServerSettings,
): Promise<void> {
  const { configuration, logger, restaurantService, catalogueService } = settings;
  const staffInterceptors = createServiceRpcInterceptors(
    'restaurant-service',
    configuration,
    logger,
  );
  const catalogueInterceptors = [
    createRpcCorrelation({ logger, generateCorrelationId: generateUuidV7 }),
  ];
  await server.register(fastifyConnectPlugin, {
    routes: (router) => {
      router.service(RestaurantService, restaurantService, { interceptors: staffInterceptors });
      router.service(RestaurantCatalogueService, catalogueService, {
        interceptors: catalogueInterceptors,
      });
    },
  });
}

export async function startRestaurantHttpServer(
  settings: RestaurantHttpServerSettings,
): Promise<RunningHttpServer> {
  const server = fastify();
  await registerRpcServices(server, settings);
  server.get('/health', () => ({ status: 'ok' }));
  try {
    const { host, port } = settings.configuration;
    return { server, url: await server.listen({ host, port }) };
  } catch (error) {
    await server.close();
    throw error;
  }
}
