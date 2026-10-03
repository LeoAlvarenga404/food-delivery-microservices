import { STATUS_CODES } from 'node:http';
import { Code, ConnectError } from '@connectrpc/connect';
import { PlaceOrderFailureSchema } from '@fd/contracts/fooddelivery/order/v1/service_pb.js';
import type { FastifyReply, FastifyRequest } from 'fastify';
import { hasZodFastifySchemaValidationErrors } from 'fastify-type-provider-zod';
import { z } from 'zod';

export const problemDetailsSchema = z.object({
  type: z.string(),
  title: z.string(),
  status: z.int(),
  detail: z.string().optional(),
  reason: z.string().optional(),
});

export type ProblemDetails = z.infer<typeof problemDetailsSchema>;

type ProblemExplanation = Pick<ProblemDetails, 'detail' | 'reason'>;

const httpStatusByConnectCode = new Map<Code, number>([
  [Code.InvalidArgument, 400],
  [Code.Unauthenticated, 401],
  [Code.PermissionDenied, 403],
  [Code.NotFound, 404],
  [Code.AlreadyExists, 422],
  [Code.FailedPrecondition, 422],
  [Code.Unavailable, 503],
  [Code.DeadlineExceeded, 504],
]);

export function problemDetails(
  status: number,
  explanation: ProblemExplanation = {},
): ProblemDetails {
  return { type: 'about:blank', title: STATUS_CODES[status] ?? 'Error', status, ...explanation };
}

function fromConnectError(error: ConnectError): ProblemDetails {
  const status = httpStatusByConnectCode.get(error.code) ?? 500;
  const [failure] = error.findDetails(PlaceOrderFailureSchema);
  return problemDetails(status, failure === undefined ? {} : { reason: failure.reason });
}

function isClientError(error: unknown): error is Error & { readonly statusCode: number } {
  if (!(error instanceof Error) || !('statusCode' in error)) return false;
  return typeof error.statusCode === 'number' && error.statusCode >= 400 && error.statusCode < 500;
}

function toProblemDetails(error: unknown): ProblemDetails {
  if (error instanceof ConnectError) return fromConnectError(error);
  if (hasZodFastifySchemaValidationErrors(error))
    return problemDetails(400, { detail: error.message });
  if (isClientError(error)) return problemDetails(error.statusCode, { detail: error.message });
  return problemDetails(500);
}

export function sendProblemDetails(
  error: unknown,
  request: FastifyRequest,
  reply: FastifyReply,
): FastifyReply {
  const problem = toProblemDetails(error);
  if (problem.status >= 500) request.log.error({ err: error }, 'request failed');
  return reply.code(problem.status).type('application/problem+json').send(problem);
}
