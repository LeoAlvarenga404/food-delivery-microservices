import type { IncomingMessage, ServerResponse } from 'node:http';
import { createClient, type Client, type Transport } from '@connectrpc/connect';
import { createConnectTransport } from '@connectrpc/connect-node';
import fastifySwagger from '@fastify/swagger';
import { createAccessTokenVerifier, createTokenExchange } from '@fd/chassis-auth';
import { stopOnSignals } from '@fd/chassis-lifecycle';
import { createLogger, type Logger } from '@fd/chassis-observability';
import { ConsumerService } from '@fd/contracts/fooddelivery/consumer/v1/service_pb.js';
import { OrderService } from '@fd/contracts/fooddelivery/order/v1/service_pb.js';
import { fastify, LogController, type FastifyInstance, type RawServerDefault } from 'fastify';
import {
  jsonSchemaTransform,
  serializerCompiler,
  validatorCompiler,
  type ZodTypeProvider,
} from 'fastify-type-provider-zod';
import { v7 as generateUuidV7 } from 'uuid';
import { z } from 'zod';
import {
  readConsumerBffConfiguration,
  type ConsumerBffConfiguration,
} from './consumer-bff.config.ts';
import { consumerRoutes } from './consumers/consumer.routes.ts';
import { problemDetails, sendProblemDetails } from './http/problem-details.adapter.ts';
import { createServiceAccess, type ServiceAccess } from './http/service-access.adapter.ts';
import { traceContextInterceptor } from './http/trace-context-interceptor.adapter.ts';
import { orderRoutes } from './orders/order.routes.ts';

export interface ConsumerBffSettings {
  readonly orderService: Client<typeof OrderService>;
  readonly consumerService: Client<typeof ConsumerService>;
  readonly serviceAccess: ServiceAccess;
  readonly logger: Logger;
  readonly generateCorrelationId: () => string;
}

export type ConsumerBffServer = FastifyInstance<
  RawServerDefault,
  IncomingMessage,
  ServerResponse,
  Logger,
  ZodTypeProvider
>;

export interface RunningConsumerBff {
  readonly url: string;
  readonly stop: () => Promise<void>;
}

const correlationIdHeader = 'x-correlation-id';
const consumerBffClientId = 'consumer-bff';

function resolveCorrelationId(
  header: string | string[] | undefined,
  generateCorrelationId: () => string,
): string {
  const isUuidHeader = typeof header === 'string' && z.uuid().safeParse(header).success;
  return isUuidHeader ? header.toLowerCase() : generateCorrelationId();
}

function createHttpServer(settings: ConsumerBffSettings): ConsumerBffServer {
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

export async function createConsumerBffServer(
  settings: ConsumerBffSettings,
): Promise<ConsumerBffServer> {
  const server = createHttpServer(settings);
  await server.register(fastifySwagger, {
    openapi: { info: { title: 'Consumer API', version: '1.0.0' } },
    transform: jsonSchemaTransform,
  });
  await server.register(orderRoutes, {
    orderService: settings.orderService,
    serviceAccess: settings.serviceAccess,
  });
  await server.register(consumerRoutes, {
    consumerService: settings.consumerService,
    serviceAccess: settings.serviceAccess,
  });
  server.get('/health', { schema: { hide: true } }, () => ({ status: 'ok' }));
  server.get('/openapi.json', { schema: { hide: true } }, () => server.swagger());
  return server;
}

function createConfiguredServiceAccess(configuration: ConsumerBffConfiguration): ServiceAccess {
  return createServiceAccess({
    verify: createAccessTokenVerifier({
      issuer: configuration.accessTokenIssuer,
      audience: consumerBffClientId,
      jwksUrl: configuration.accessTokenJwksUrl,
    }),
    exchange: createTokenExchange({
      tokenUrl: configuration.tokenExchangeUrl,
      clientId: consumerBffClientId,
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
  configuration: ConsumerBffConfiguration,
): Pick<ConsumerBffSettings, 'orderService' | 'consumerService'> {
  const { orderServiceUrl, orderServiceTimeoutInMilliseconds } = configuration;
  const { consumerServiceUrl, consumerServiceTimeoutInMilliseconds } = configuration;
  return {
    orderService: createClient(
      OrderService,
      createServiceTransport(orderServiceUrl, orderServiceTimeoutInMilliseconds),
    ),
    consumerService: createClient(
      ConsumerService,
      createServiceTransport(consumerServiceUrl, consumerServiceTimeoutInMilliseconds),
    ),
  };
}

export async function startConsumerBff(
  configuration: ConsumerBffConfiguration,
): Promise<RunningConsumerBff> {
  const logger = createLogger({ serviceName: 'consumer-bff', level: configuration.logLevel });
  const server = await createConsumerBffServer({
    ...createServiceClients(configuration),
    serviceAccess: createConfiguredServiceAccess(configuration),
    logger,
    generateCorrelationId: generateUuidV7,
  });
  try {
    const url = await server.listen({ host: configuration.host, port: configuration.port });
    logger.info({ url }, 'consumer bff started');
    return { url, stop: () => server.close() };
  } catch (error) {
    await server.close();
    throw error;
  }
}

if (import.meta.main) {
  const configuration = readConsumerBffConfiguration(process.env);
  const consumerBff = await startConsumerBff(configuration);
  const logger = createLogger({ serviceName: 'consumer-bff', level: configuration.logLevel });
  stopOnSignals(consumerBff, logger);
}
