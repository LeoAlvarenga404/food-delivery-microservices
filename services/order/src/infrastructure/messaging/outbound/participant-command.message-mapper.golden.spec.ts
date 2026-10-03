import { expectGoldenSample } from '@fd/chassis-testing';
import { goldenSamplesDirectory } from '@fd/contracts';
import { AuthorizePaymentSchema } from '@fd/contracts/fooddelivery/accounting/v1/commands_pb.js';
import { VerifyConsumerSchema } from '@fd/contracts/fooddelivery/consumer/v1/commands_pb.js';
import {
  ApproveTicketSchema,
  CreateTicketSchema,
  RejectTicketSchema,
} from '@fd/contracts/fooddelivery/kitchen/v1/commands_pb.js';
import { describe, it } from 'vitest';
import {
  buildSagaOrder,
  sagaPaymentToken,
} from '../../../../test/support/place-order-saga.builder.ts';
import {
  toApproveTicket,
  toAuthorizePayment,
  toCreateTicket,
  toRejectTicket,
  toVerifyConsumer,
} from './participant-command.message-mapper.ts';

const order = buildSagaOrder();
const directory = goldenSamplesDirectory;

describe('participant command golden samples', () => {
  it('produces the VerifyConsumer sample', async () => {
    await expectGoldenSample(
      { directory, topic: 'consumer.commands', schema: VerifyConsumerSchema },
      toVerifyConsumer(order),
    );
  });

  it('produces the CreateTicket sample', async () => {
    await expectGoldenSample(
      { directory, topic: 'kitchen.commands', schema: CreateTicketSchema },
      toCreateTicket(order),
    );
  });

  it('produces the AuthorizePayment sample', async () => {
    await expectGoldenSample(
      { directory, topic: 'accounting.commands', schema: AuthorizePaymentSchema },
      toAuthorizePayment(order, sagaPaymentToken),
    );
  });

  it('produces the ApproveTicket sample', async () => {
    await expectGoldenSample(
      { directory, topic: 'kitchen.commands', schema: ApproveTicketSchema },
      toApproveTicket(order),
    );
  });

  it('produces the RejectTicket sample', async () => {
    await expectGoldenSample(
      { directory, topic: 'kitchen.commands', schema: RejectTicketSchema },
      toRejectTicket(order),
    );
  });
});
