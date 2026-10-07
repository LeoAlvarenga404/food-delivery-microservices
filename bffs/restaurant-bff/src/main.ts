import type { IncomingMessage, ServerResponse } from 'node:http';
import { createClient, type Client, type Transport } from '@connectrpc/connect';
import { createConnectTransport } from '@connectrpc/connect-node';
import fastifySwagger from '@fastify/swagger';
import { createAccessTokenVerifier, createTokenExchange } from '@fd/chassis-auth';
import { stopOnSignals } from '@fd/chassis-lifecycle';
import { createLogger, type Logger } from '@fd/chassis-observability';
import { traceContextInterceptor } from '@fd/chassis-rpc';
import { KitchenService } from '@fd/contracts/fooddelivery/kitchen/v1/service_pb.js';
import { RestaurantService } from '@fd/contracts/fooddelivery/restaurant/v1/service_pb.js';
import { fastify, LogController, type FastifyInstance, type RawServerDefault } from 'fastify';
import {
  jsonSchemaTransform,
  serializerCompiler,
  validatorCompiler,
  type ZodTypeProvider,
} from 'fastify-type-provider-zod';
import { v7 as generateUuidV7 } from 'uuid';
import { z } from 'zod';
import { problemDetails, sendProblemDetails } from './http/problem-details.adapter.ts';
import { createServiceAccess, type ServiceAccess } from './http/service-access.adapter.ts';
import {
  readRestaurantBffConfiguration,
  type RestaurantBffConfiguration,
} from './restaurant-bff.config.ts';
import { restaurantRoutes } from './restaurants/restaurant.routes.ts';
import { ticketRoutes } from './tickets/ticket.routes.ts';

export interface RestaurantBffSettings {
  readonly restaurantService: Client<typeof RestaurantService>;
  readonly kitchenService: Client<typeof KitchenService>;
  readonly serviceAccess: ServiceAccess;
  readonly logger: Logger;
  readonly generateCorrelationId: () => string;
}

export type RestaurantBffServer = FastifyInstance<
  RawServerDefault,
  IncomingMessage,
  ServerResponse,
  Logger,
  ZodTypeProvider
>;

export interface RunningRestaurantBff {
  readonly url: string;
  readonly stop: () => Promise<void>;
}

const correlationIdHeader = 'x-correlation-id';
const restaurantBffClientId = 'restaurant-bff';

function resolveCorrelationId(
  header: string | string[] | undefined,
  generateCorrelationId: () => string,
): string {
  const isUuidHeader = typeof header === 'string' && z.uuid().safeParse(header).success;
  return isUuidHeader ? header.toLowerCase() : generateCorrelationId();
}

function createHttpServer(settings: RestaurantBffSettings): RestaurantBffServer {
  const server = fastify({
    loggerInstance: settings.logger,
    logController: new LogController({
      requestIdLogLabel: 'correlationId',
      disableRequestLogging: true,
    }),
    genReqId: (request) =>
      resolveCorrelationId(request.headers[correlationIdHeader], settings.generateCorrelationId),
    frameworkErrors: (error, request, reply) => {
      void sendProblemDetails(error, request, reply.header(correlationIdHeader, request.id));
    },
  }).withTypeProvider<ZodTypeProvider>();
  server.setValidatorCompiler(validatorCompiler);
  server.setSerializerCompiler(serializerCompiler);
  server.setErrorHandler(sendProblemDetails);
  server.setNotFoundHandler((request, reply) =>
    reply.code(404).type('application/problem+json').send(problemDetails(404)),
  );
  server.addHook('onRequest', (request, reply, done) => {
    reply.header(correlationIdHeader, request.id);
    done();
  });
  return server;
}

export async function createRestaurantBffServer(
  settings: RestaurantBffSettings,
): Promise<RestaurantBffServer> {
  const server = createHttpServer(settings);
  await server.register(fastifySwagger, {
    openapi: { info: { title: 'Restaurant API', version: '1.0.0' } },
    transform: jsonSchemaTransform,
  });
  await server.register(restaurantRoutes, {
    restaurantService: settings.restaurantService,
    serviceAccess: settings.serviceAccess,
  });
  await server.register(ticketRoutes, {
    kitchenService: settings.kitchenService,
    serviceAccess: settings.serviceAccess,
  });
  server.get('/health', { schema: { hide: true } }, () => ({ status: 'ok' }));
  server.get('/openapi.json', { schema: { hide: true } }, () => server.swagger());
  return server;
}

function createConfiguredServiceAccess(configuration: RestaurantBffConfiguration): ServiceAccess {
  return createServiceAccess({
    verify: createAccessTokenVerifier({
      issuer: configuration.accessTokenIssuer,
      audience: restaurantBffClientId,
      jwksUrl: configuration.accessTokenJwksUrl,
    }),
    exchange: createTokenExchange({
      tokenUrl: configuration.tokenExchangeUrl,
      clientId: restaurantBffClientId,
      clientSecret: configuration.clientSecret,
    }),
  });
}

function createServiceTransport(baseUrl: string, timeoutInMilliseconds: number): Transport {
  return createConnectTransport({
    baseUrl,
    httpVersion: '1.1',
    useBinaryFormat: true,
    defaultTimeoutMs: timeoutInMilliseconds,
    interceptors: [traceContextInterceptor],
  });
}

function createServiceClients(
  configuration: RestaurantBffConfiguration,
): Pick<RestaurantBffSettings, 'restaurantService' | 'kitchenService'> {
  const {
    restaurantServiceUrl,
    restaurantServiceTimeoutInMilliseconds,
    kitchenServiceUrl,
    kitchenServiceTimeoutInMilliseconds,
  } = configuration;
  return {
    restaurantService: createClient(
      RestaurantService,
      createServiceTransport(restaurantServiceUrl, restaurantServiceTimeoutInMilliseconds),
    ),
    kitchenService: createClient(
      KitchenService,
      createServiceTransport(kitchenServiceUrl, kitchenServiceTimeoutInMilliseconds),
    ),
  };
}

export async function startRestaurantBff(
  configuration: RestaurantBffConfiguration,
): Promise<RunningRestaurantBff> {
  const logger = createLogger({ serviceName: 'restaurant-bff', level: configuration.logLevel });
  const server = await createRestaurantBffServer({
    ...createServiceClients(configuration),
    serviceAccess: createConfiguredServiceAccess(configuration),
    logger,
    generateCorrelationId: generateUuidV7,
  });
  try {
    const url = await server.listen({ host: configuration.host, port: configuration.port });
    logger.info({ url }, 'restaurant bff started');
    return { url, stop: () => server.close() };
  } catch (error) {
    await server.close();
    throw error;
  }
}

if (import.meta.main) {
  const configuration = readRestaurantBffConfiguration(process.env);
  const restaurantBff = await startRestaurantBff(configuration);
  const logger = createLogger({ serviceName: 'restaurant-bff', level: configuration.logLevel });
  stopOnSignals(restaurantBff, logger);
}
