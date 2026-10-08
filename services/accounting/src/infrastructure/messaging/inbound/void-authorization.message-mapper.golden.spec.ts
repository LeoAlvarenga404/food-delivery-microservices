import { readGoldenSample } from '@fd/chassis-testing';
import { goldenSamplesDirectory } from '@fd/contracts';
import { VoidAuthorizationSchema } from '@fd/contracts/fooddelivery/accounting/v1/commands_pb.js';
import { describe, expect, it } from 'vitest';
import { buildCommandMessage } from '../../../../test/support/command-message.builder.ts';
import { toVoidAuthorizationCommand } from './void-authorization.message-mapper.ts';

describe('void authorization golden sample', () => {
  it('reads the VoidAuthorization sample the Order service produces', async () => {
    const sample = await readGoldenSample({
      directory: goldenSamplesDirectory,
      topic: 'accounting.commands',
      schema: VoidAuthorizationSchema,
    });

    const { orderId } = toVoidAuthorizationCommand(
      buildCommandMessage(VoidAuthorizationSchema, sample),
    );

    expect(orderId).toBe('0199a5d0-0000-7000-8000-0000000000a1');
  });
});
