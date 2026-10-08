import { left, right, type Brand, type Either } from '@fd/domain';

export type GatewayAuthorizationId = Brand<string, 'GatewayAuthorizationId'>;

export interface InvalidGatewayAuthorizationId {
  readonly type: 'InvalidGatewayAuthorizationId';
  readonly rawGatewayAuthorizationId: string;
}

export function parseGatewayAuthorizationId(
  rawGatewayAuthorizationId: string,
): Either<InvalidGatewayAuthorizationId, GatewayAuthorizationId> {
  if (rawGatewayAuthorizationId.trim().length === 0) {
    return left({ type: 'InvalidGatewayAuthorizationId', rawGatewayAuthorizationId });
  }
  return right(rawGatewayAuthorizationId as GatewayAuthorizationId);
}
