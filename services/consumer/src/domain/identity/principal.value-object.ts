import { left, right, type Either } from '@fd/domain';
import { parseConsumerId, type ConsumerId } from '#domain/consumer/consumer-id.value-object.ts';

export interface Principal {
  readonly consumerId: ConsumerId;
}

export interface PrincipalClaims {
  readonly subject: string;
  readonly roles: readonly string[];
}

export interface MissingConsumerRole {
  readonly type: 'MissingConsumerRole';
}

export interface InvalidPrincipalSubject {
  readonly type: 'InvalidPrincipalSubject';
  readonly subject: string;
}

export type PrincipalError = MissingConsumerRole | InvalidPrincipalSubject;

const consumerRole = 'consumer';

export function parsePrincipal(claims: PrincipalClaims): Either<PrincipalError, Principal> {
  if (!claims.roles.includes(consumerRole)) return left({ type: 'MissingConsumerRole' });
  const consumerId = parseConsumerId(claims.subject);
  if (consumerId.isLeft())
    return left({ type: 'InvalidPrincipalSubject', subject: claims.subject });
  return right({ consumerId: consumerId.success });
}
