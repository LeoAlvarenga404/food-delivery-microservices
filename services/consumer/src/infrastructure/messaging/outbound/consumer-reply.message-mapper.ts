import { create, toBinary } from '@bufbuild/protobuf';
import type { OutboxMessage } from '@fd/chassis-outbox';
import {
  ConsumerVerifiedSchema,
  type ConsumerVerified,
} from '@fd/contracts/fooddelivery/consumer/v1/replies_pb.js';
import type { ConsumerReply } from '#application/ports/reply-sender.port.ts';

export function toConsumerVerified(reply: ConsumerReply): ConsumerVerified {
  return create(ConsumerVerifiedSchema, { consumerId: reply.consumerId, orderId: reply.orderId });
}

export function toConsumerReplyMessage(reply: ConsumerReply, sagaId: string): OutboxMessage {
  return {
    topic: 'order.place-order-saga.replies',
    aggregateType: 'PlaceOrderSaga',
    aggregateId: sagaId,
    messageType: ConsumerVerifiedSchema.typeName,
    payload: toBinary(ConsumerVerifiedSchema, toConsumerVerified(reply)),
    sagaId,
  };
}
