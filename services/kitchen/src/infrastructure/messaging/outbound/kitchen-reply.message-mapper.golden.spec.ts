import { expectGoldenSample } from '@fd/chassis-testing';
import { goldenSamplesDirectory } from '@fd/contracts';
import {
  TicketApprovedSchema,
  TicketCreatedSchema,
  TicketCreationFailedSchema,
} from '@fd/contracts/fooddelivery/kitchen/v1/replies_pb.js';
import { describe, it } from 'vitest';
import { orderId, ticketId } from '../../../../test/support/ticket.builder.ts';
import {
  toTicketApproved,
  toTicketCreated,
  toTicketCreationFailed,
} from './kitchen-reply.message-mapper.ts';

const directory = goldenSamplesDirectory;
const topic = 'order.place-order-saga.replies';

describe('kitchen reply golden samples', () => {
  it('produces the TicketCreated sample', async () => {
    await expectGoldenSample(
      { directory, topic, schema: TicketCreatedSchema },
      toTicketCreated({ type: 'TicketCreated', orderId, ticketId }),
    );
  });

  it('produces the TicketApproved sample', async () => {
    await expectGoldenSample(
      { directory, topic, schema: TicketApprovedSchema },
      toTicketApproved({ type: 'TicketApproved', orderId, ticketId }),
    );
  });

  it('produces the TicketCreationFailed sample', async () => {
    await expectGoldenSample(
      { directory, topic, schema: TicketCreationFailedSchema },
      toTicketCreationFailed({ type: 'TicketCreationFailed', orderId, reason: 'InvalidQuantity' }),
    );
  });
});
