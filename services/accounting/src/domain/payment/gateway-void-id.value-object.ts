import { left, right, type Brand, type Either } from '@fd/domain';

export type GatewayVoidId = Brand<string, 'GatewayVoidId'>;

export interface InvalidGatewayVoidId {
  readonly type: 'InvalidGatewayVoidId';
  readonly rawGatewayVoidId: string;
}

export function parseGatewayVoidId(
  rawGatewayVoidId: string,
): Either<InvalidGatewayVoidId, GatewayVoidId> {
  if (rawGatewayVoidId.trim().length === 0) {
    return left({ type: 'InvalidGatewayVoidId', rawGatewayVoidId });
  }
  return right(rawGatewayVoidId as GatewayVoidId);
}
