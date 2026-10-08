import { left, right } from '@fd/domain';
import { describe, expect, it } from 'vitest';
import { parseGatewayVoidId } from './gateway-void-id.value-object.ts';

describe('parseGatewayVoidId', () => {
  it('keeps the reference the gateway chose exactly as it was answered', () => {
    expect(parseGatewayVoidId('VOID-0199a5d0')).toEqual(right('VOID-0199a5d0'));
  });

  it.each(['', '   '])('rejects the blank reference "%s"', (rawGatewayVoidId) => {
    expect(parseGatewayVoidId(rawGatewayVoidId)).toEqual(
      left({ type: 'InvalidGatewayVoidId', rawGatewayVoidId }),
    );
  });
});
