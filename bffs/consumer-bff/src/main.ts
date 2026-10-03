import type { IncomingMessage, ServerResponse } from 'node:http';
import { createClient, type Client } from '@connectrpc/connect';
import { createConnectTransport } from '@connectrpc/connect-node';
import fastifySwagger from '@fastify/swagger';
import { stopOnSignals } from '@fd/chassis-lifecycle';
import { createLogger, type Logger } from '@fd/chassis-observability';
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
import { problemDetails, sendProblemDetails } from './http/problem-details.adapter.ts';
import { traceContextInterceptor } from './http/trace-context-interceptor.adapter.ts';
import { orderRoutes } from './orders/order.routes.ts';

export interface ConsumerBffSettings {
  readonly orderService: Client<typeof OrderService>;
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
  await server.register(orderRoutes, { orderService: settings.orderService });
  server.get('/health', { schema: { hide: true } }, () => ({ status: 'ok' }));
  server.get('/openapi.json', { schema: { hide: true } }, () => server.swagger());
  return server;
}

export async function startConsumerBff(
  configuration: ConsumerBffConfiguration,
): Promise<RunningConsumerBff> {
  const logger = createLogger({ serviceName: 'consumer-bff', level: configuration.logLevel });
  const orderService = createClient(
    OrderService,
    createConnectTransport({
      baseUrl: configuration.orderServiceUrl,
      httpVersion: '1.1',
      useBinaryFormat: true,
      defaultTimeoutMs: configuration.orderServiceTimeoutInMilliseconds,
      interceptors: [traceContextInterceptor],
    }),
  );
  const server = await createConsumerBffServer({
    orderService,
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
