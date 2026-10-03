import {
  Code,
  ConnectError,
  createClient,
  createRouterTransport,
  type Client,
} from '@connectrpc/connect';
import { OrderService } from '@fd/contracts/fooddelivery/order/v1/service_pb.js';
import { left, right } from '@fd/domain';
import { beforeEach, describe, expect, it } from 'vitest';
import {
  createAccessTokenInterceptor,
  verifiedAccessTokenKey,
} from './access-token-interceptor.ts';
import type { AccessTokenVerifier } from './access-token-verifier.ts';

const consumerId = '0199a5d0-0000-7000-8000-0000000000c1';

let verifiedTokens: string[];
let client: Client<typeof OrderService>;

const verify: AccessTokenVerifier = (accessToken) => {
  verifiedTokens.push(accessToken);
  if (accessToken === 'unreachable-key-set') {
    return Promise.reject(new Error('key set unreachable'));
  }
  return Promise.resolve(
    accessToken === 'valid-token'
      ? right({ subject: consumerId, roles: ['consumer'] })
      : left({ type: 'InvalidAccessToken', reason: 'ERR_JWT_EXPIRED' }),
  );
};

function bearer(accessToken: string): { readonly headers: Record<string, string> } {
  return { headers: { authorization: `Bearer ${accessToken}` } };
}

async function rejectionOf(call: Promise<unknown>): Promise<ConnectError> {
  const error = await call.then(
    () => undefined,
    (rejection: unknown) => rejection,
  );
  return ConnectError.from(error);
}

beforeEach(() => {
  verifiedTokens = [];
  const transport = createRouterTransport(
    ({ service }) => {
      service(OrderService, {
        getOrder: (request, context) => ({
          orderId: context.values.get(verifiedAccessTokenKey)?.subject ?? 'no verified token',
        }),
      });
    },
    { router: { interceptors: [createAccessTokenInterceptor(verify)] } },
  );
  client = createClient(OrderService, transport);
});

describe('createAccessTokenInterceptor', () => {
  it('hands the verified access token to the handler', async () => {
    const response = await client.getOrder({}, bearer('valid-token'));

    expect(response.orderId).toBe(consumerId);
    expect(verifiedTokens).toEqual(['valid-token']);
  });

  it('refuses a call without a bearer token as unauthenticated without verifying anything', async () => {
    const error = await rejectionOf(client.getOrder({}));

    expect(error.code).toBe(Code.Unauthenticated);
    expect(verifiedTokens).toEqual([]);
  });

  it('refuses a call whose token the verifier refuses as unauthenticated and names the reason', async () => {
    const error = await rejectionOf(client.getOrder({}, bearer('expired-token')));

    expect(error.code).toBe(Code.Unauthenticated);
    expect(error.rawMessage).toBe('ERR_JWT_EXPIRED');
  });

  it('lets a verifier failure through instead of calling it unauthenticated', async () => {
    const error = await rejectionOf(client.getOrder({}, bearer('unreachable-key-set')));

    expect(error.code).not.toBe(Code.Unauthenticated);
  });
});
