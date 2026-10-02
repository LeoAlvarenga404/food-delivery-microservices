import { readGoldenSample } from '@fd/chassis-testing';
import { goldenSamplesDirectory } from '@fd/contracts';
import { VerifyConsumerSchema } from '@fd/contracts/fooddelivery/consumer/v1/commands_pb.js';
import { describe, expect, it } from 'vitest';
import { buildCommandMessage } from '../../../../test/support/command-message.builder.ts';
import { toVerifyConsumerCommand } from './verify-consumer.message-mapper.ts';

describe('consumer command golden samples', () => {
  it('reads the VerifyConsumer sample the Order service produces', async () => {
    const sample = await readGoldenSample({
      directory: goldenSamplesDirectory,
      topic: 'consumer.commands',
      schema: VerifyConsumerSchema,
    });

    const { consumerId, orderId } = toVerifyConsumerCommand(
      buildCommandMessage(VerifyConsumerSchema, sample),
    );

    expect({ consumerId, orderId }).toEqual({
      consumerId: '0199a5d0-0000-7000-8000-0000000000c1',
      orderId: '0199a5d0-0000-7000-8000-0000000000a1',
    });
  });
});
