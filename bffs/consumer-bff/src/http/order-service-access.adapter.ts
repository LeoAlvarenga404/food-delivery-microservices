import { readBearerToken, type AccessTokenVerifier, type TokenExchange } from '@fd/chassis-auth';
import { left, right, type Either } from '@fd/domain';

export interface AccessRefused {
  readonly status: 401 | 403;
}

export type OrderServiceAccess = (
  authorization: string | undefined,
) => Promise<Either<AccessRefused, string>>;

export interface OrderServiceAccessSettings {
  readonly verify: AccessTokenVerifier;
  readonly exchange: TokenExchange;
}

const consumerRole = 'consumer';
const orderServiceAudience = 'order-service';

export function createOrderServiceAccess(settings: OrderServiceAccessSettings): OrderServiceAccess {
  return async (authorization) => {
    const accessToken = readBearerToken(authorization);
    if (accessToken === undefined) return left({ status: 401 });
    const verified = await settings.verify(accessToken);
    if (verified.isLeft()) return left({ status: 401 });
    if (!verified.success.roles.includes(consumerRole)) return left({ status: 403 });
    const exchanged = await settings.exchange(accessToken, orderServiceAudience);
    return exchanged.isLeft() ? left({ status: 401 }) : right(exchanged.success);
  };
}
