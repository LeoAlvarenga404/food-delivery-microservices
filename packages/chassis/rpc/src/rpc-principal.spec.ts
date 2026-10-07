import {
  Code,
  ConnectError,
  createClient,
  createRouterTransport,
  type Client,
  type Interceptor,
} from '@connectrpc/connect';
import { verifiedAccessTokenKey, type VerifiedAccessToken } from '@fd/chassis-auth';
import { OrderService } from '@fd/contracts/fooddelivery/order/v1/service_pb.js';
import { left, right, type Either } from '@fd/domain';
import { describe, expect, it } from 'vitest';
import { principalOf, type PrincipalRefusal } from './rpc-principal.ts';

interface CourierPrincipal {
  readonly courierId: string;
}

function parseCourierPrincipal(
  verifiedAccessToken: VerifiedAccessToken,
): Either<PrincipalRefusal, CourierPrincipal> {
  if (!verifiedAccessToken.roles.includes('courier')) return left({ type: 'MissingCourierRole' });
  return right({ courierId: verifiedAccessToken.subject });
}

function verifiedAs(verifiedAccessToken: VerifiedAccessToken | undefined): Interceptor {
  return (next) => (request) => {
    request.contextValues.set(verifiedAccessTokenKey, verifiedAccessToken);
    return next(request);
  };
}

function clientVerifiedAs(
  verifiedAccessToken: VerifiedAccessToken | undefined,
): Client<typeof OrderService> {
  const transport = createRouterTransport(
    ({ service }) => {
      service(OrderService, {
        getOrder: (request, context) => ({
          orderId: principalOf(context, parseCourierPrincipal).courierId,
        }),
      });
    },
    { router: { interceptors: [verifiedAs(verifiedAccessToken)] } },
  );
  return createClient(OrderService, transport);
}

async function rejectionOf(call: Promise<unknown>): Promise<ConnectError> {
  return ConnectError.from(
    await call.then(
      () => undefined,
      (rejection: unknown) => rejection,
    ),
  );
}

describe('principalOf', () => {
  it('parses the verified access token of the call into the principal', async () => {
    const client = clientVerifiedAs({ subject: 'courier-7', roles: ['courier'] });

    expect((await client.getOrder({})).orderId).toBe('courier-7');
  });

  it('refuses a call that reached the handler without a verified access token', async () => {
    const error = await rejectionOf(clientVerifiedAs(undefined).getOrder({}));

    expect(error.code).toBe(Code.Unauthenticated);
  });

  it('refuses a verified token the parser rejects, naming the refusal', async () => {
    const client = clientVerifiedAs({ subject: 'consumer-7', roles: ['consumer'] });

    const error = await rejectionOf(client.getOrder({}));

    expect(error.code).toBe(Code.PermissionDenied);
    expect(error.rawMessage).toBe('MissingCourierRole');
  });
});
