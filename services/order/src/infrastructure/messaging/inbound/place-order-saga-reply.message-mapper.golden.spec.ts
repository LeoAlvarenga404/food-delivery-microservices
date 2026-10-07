import type { DescMessage } from '@bufbuild/protobuf';
import { readGoldenSample } from '@fd/chassis-testing';
import { goldenSamplesDirectory } from '@fd/contracts';
import {
  PaymentAuthorizedSchema,
  PaymentFailedSchema,
} from '@fd/contracts/fooddelivery/accounting/v1/replies_pb.js';
import {
  ConsumerVerificationFailedSchema,
  ConsumerVerifiedSchema,
} from '@fd/contracts/fooddelivery/consumer/v1/replies_pb.js';
import {
  TicketApprovedSchema,
  TicketCreatedSchema,
  TicketCreationFailedSchema,
  TicketRejectedSchema,
} from '@fd/contracts/fooddelivery/kitchen/v1/replies_pb.js';
import { describe, expect, it } from 'vitest';
import { buildReplyMessage } from '../../../../test/support/reply-message.builder.ts';
import type { PlaceOrderSagaReply } from '#application/sagas/place-order/place-order.saga-state.ts';
import { toPlaceOrderSagaReply } from './place-order-saga-reply.message-mapper.ts';

const directory = goldenSamplesDirectory;
const topic = 'order.place-order-saga.replies';
const orderId = '0199a5d0-0000-7000-8000-0000000000a1';

describe('place order saga reply golden samples', () => {
  it.each<{
    readonly producer: string;
    readonly schema: DescMessage;
    readonly reply: PlaceOrderSagaReply;
  }>([
    { producer: 'Consumer', schema: ConsumerVerifiedSchema, reply: { type: 'ConsumerVerified' } },
    {
      producer: 'Consumer',
      schema: ConsumerVerificationFailedSchema,
      reply: { type: 'ConsumerVerificationFailed', rejectionReason: 'CONSUMER_NOT_FOUND' },
    },
    { producer: 'Kitchen', schema: TicketCreatedSchema, reply: { type: 'TicketCreated' } },
    {
      producer: 'Kitchen',
      schema: TicketCreationFailedSchema,
      reply: { type: 'TicketCreationFailed', rejectionReason: 'TICKET_REFUSED' },
    },
    { producer: 'Kitchen', schema: TicketApprovedSchema, reply: { type: 'TicketApproved' } },
    { producer: 'Kitchen', schema: TicketRejectedSchema, reply: { type: 'TicketRejected' } },
    {
      producer: 'Accounting',
      schema: PaymentAuthorizedSchema,
      reply: { type: 'PaymentAuthorized' },
    },
    {
      producer: 'Accounting',
      schema: PaymentFailedSchema,
      reply: { type: 'PaymentFailed', rejectionReason: 'PAYMENT_DECLINED' },
    },
  ])('reads the $reply.type sample the $producer service produces', async ({ schema, reply }) => {
    const sample = await readGoldenSample({ directory, topic, schema });

    expect(toPlaceOrderSagaReply(buildReplyMessage(schema, sample))).toEqual({ orderId, reply });
  });
});
