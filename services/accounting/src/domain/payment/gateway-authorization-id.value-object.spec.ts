import { left, right } from '@fd/domain';
import { describe, expect, it } from 'vitest';
import { parseGatewayAuthorizationId } from './gateway-authorization-id.value-object.ts';

describe('parseGatewayAuthorizationId', () => {
  it('keeps the reference the gateway chose exactly as it was answered', () => {
    expect(parseGatewayAuthorizationId('AUTH-0199a5d0')).toEqual(right('AUTH-0199a5d0'));
  });

  it.each(['', '   '])('rejects the blank reference "%s"', (rawGatewayAuthorizationId) => {
    expect(parseGatewayAuthorizationId(rawGatewayAuthorizationId)).toEqual(
      left({ type: 'InvalidGatewayAuthorizationId', rawGatewayAuthorizationId }),
    );
  });
});
