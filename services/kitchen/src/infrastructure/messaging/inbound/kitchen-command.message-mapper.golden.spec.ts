import { readGoldenSample } from '@fd/chassis-testing';
import { goldenSamplesDirectory } from '@fd/contracts';
import {
  ApproveTicketSchema,
  CreateTicketSchema,
  RejectTicketSchema,
} from '@fd/contracts/fooddelivery/kitchen/v1/commands_pb.js';
import { describe, expect, it } from 'vitest';
import { buildCommandMessage } from '../../../../test/support/command-message.builder.ts';
import { createTicketInput } from '../../../../test/support/ticket.builder.ts';
import { toKitchenCommand } from './kitchen-command.message-mapper.ts';

const directory = goldenSamplesDirectory;
const topic = 'kitchen.commands';

describe('kitchen command golden samples', () => {
  it('reads the CreateTicket sample the Order service produces', async () => {
    const sample = await readGoldenSample({ directory, topic, schema: CreateTicketSchema });

    const kitchenCommand = toKitchenCommand(buildCommandMessage(CreateTicketSchema, sample));

    const { orderId, restaurantId, consumerId, lineItems } = createTicketInput();
    expect(kitchenCommand).toMatchObject({
      type: 'CreateTicket',
      command: { orderId, restaurantId, consumerId, lineItems },
    });
  });

  it('reads the ApproveTicket sample the Order service produces', async () => {
    const sample = await readGoldenSample({ directory, topic, schema: ApproveTicketSchema });

    const kitchenCommand = toKitchenCommand(buildCommandMessage(ApproveTicketSchema, sample));

    expect(kitchenCommand).toMatchObject({
      type: 'ApproveTicket',
      command: { orderId: createTicketInput().orderId },
    });
  });

  it('reads the RejectTicket sample the Order service produces', async () => {
    const sample = await readGoldenSample({ directory, topic, schema: RejectTicketSchema });

    const kitchenCommand = toKitchenCommand(buildCommandMessage(RejectTicketSchema, sample));

    expect(kitchenCommand).toMatchObject({
      type: 'RejectTicket',
      command: { orderId: createTicketInput().orderId },
    });
  });
});
