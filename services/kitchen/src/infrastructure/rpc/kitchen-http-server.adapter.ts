import type { ServiceImpl } from '@connectrpc/connect';
import { fastifyConnectPlugin } from '@connectrpc/connect-fastify';
import type { Logger } from '@fd/chassis-observability';
import { createServiceRpcInterceptors } from '@fd/chassis-rpc';
import { KitchenService } from '@fd/contracts/fooddelivery/kitchen/v1/service_pb.js';
import { fastify, type FastifyInstance } from 'fastify';
import type { KitchenServiceConfiguration } from '#infrastructure/kitchen-service.config.ts';

export interface KitchenHttpServerSettings {
  readonly configuration: KitchenServiceConfiguration;
  readonly logger: Logger;
  readonly kitchenService: ServiceImpl<typeof KitchenService>;
}

export interface RunningHttpServer {
  readonly server: FastifyInstance;
  readonly url: string;
}

export async function startKitchenHttpServer(
  settings: KitchenHttpServerSettings,
): Promise<RunningHttpServer> {
  const { configuration, logger, kitchenService } = settings;
  const server = fastify();
  await server.register(fastifyConnectPlugin, {
    routes: (router) => router.service(KitchenService, kitchenService),
    interceptors: createServiceRpcInterceptors('kitchen-service', configuration, logger),
  });
  server.get('/health', () => ({ status: 'ok' }));
  try {
    const { host, port } = configuration;
    return { server, url: await server.listen({ host, port }) };
  } catch (error) {
    await server.close();
    throw error;
  }
}
