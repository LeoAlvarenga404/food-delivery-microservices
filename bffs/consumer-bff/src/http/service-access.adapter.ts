import type { IncomingMessage, ServerResponse } from 'node:http';
import type { CallOptions } from '@connectrpc/connect';
import { readBearerToken, type AccessTokenVerifier, type TokenExchange } from '@fd/chassis-auth';
import { left, right, type Either } from '@fd/domain';
import type { FastifyBaseLogger, FastifyInstance, FastifyRequest, RawServerDefault } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { problemDetails } from './problem-details.adapter.ts';

export interface AccessRefused {
  readonly status: 401 | 403;
}

export type ServiceAccess = (
  authorization: string | undefined,
  audience: string,
) => Promise<Either<AccessRefused, string>>;

export interface ServiceAccessSettings {
  readonly verify: AccessTokenVerifier;
  readonly exchange: TokenExchange;
}

export type RoutesServer = FastifyInstance<
  RawServerDefault,
  IncomingMessage,
  ServerResponse,
  FastifyBaseLogger,
  ZodTypeProvider
>;

const consumerRole = 'consumer';
const serviceTokenDecorator = 'serviceToken';

export function createServiceAccess(settings: ServiceAccessSettings): ServiceAccess {
  return async (authorization, audience) => {
    const accessToken = readBearerToken(authorization);
    if (accessToken === undefined) return left({ status: 401 });
    const verified = await settings.verify(accessToken);
    if (verified.isLeft()) return left({ status: 401 });
    if (!verified.success.roles.includes(consumerRole)) return left({ status: 403 });
    const exchanged = await settings.exchange(accessToken, audience);
    return exchanged.isLeft() ? left({ status: 401 }) : right(exchanged.success);
  };
}

export function requireServiceAccess(
  server: RoutesServer,
  access: ServiceAccess,
  audience: string,
): void {
  server.decorateRequest(serviceTokenDecorator, '');
  server.addHook('onRequest', async (request, reply) => {
    const granted = await access(request.headers.authorization, audience);
    if (granted.isLeft()) {
      const { status } = granted.failure;
      return reply.code(status).type('application/problem+json').send(problemDetails(status));
    }
    request.setDecorator(serviceTokenDecorator, granted.success);
    return undefined;
  });
}

export function serviceCallOptions(request: FastifyRequest): CallOptions {
  const serviceToken = request.getDecorator<string>(serviceTokenDecorator);
  return { headers: { 'x-correlation-id': request.id, authorization: `Bearer ${serviceToken}` } };
}
