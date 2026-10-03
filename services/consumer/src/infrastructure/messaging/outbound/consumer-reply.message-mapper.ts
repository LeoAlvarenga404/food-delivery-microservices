import { create, toBinary, type DescMessage, type MessageShape } from '@bufbuild/protobuf';
import type { OutboxMessage } from '@fd/chassis-outbox';
import {
  ConsumerVerificationFailedSchema,
  ConsumerVerificationFailureReason,
  ConsumerVerifiedSchema,
  type ConsumerVerificationFailed,
  type ConsumerVerified,
} from '@fd/contracts/fooddelivery/consumer/v1/replies_pb.js';
import type {
  ConsumerReply,
  ConsumerVerificationFailedReply,
  ConsumerVerifiedReply,
} from '#application/ports/reply-sender.port.ts';

function toFailureReason(
  reason: ConsumerVerificationFailedReply['reason'],
): ConsumerVerificationFailureReason {
  switch (reason) {
    case 'ConsumerNotFound':
      return ConsumerVerificationFailureReason.CONSUMER_NOT_FOUND;
    case 'ConsumerBlocked':
      return ConsumerVerificationFailureReason.CONSUMER_BLOCKED;
  }
}

export function toConsumerVerified(reply: ConsumerVerifiedReply): ConsumerVerified {
  return create(ConsumerVerifiedSchema, { consumerId: reply.consumerId, orderId: reply.orderId });
}

export function toConsumerVerificationFailed(
  reply: ConsumerVerificationFailedReply,
): ConsumerVerificationFailed {
  return create(ConsumerVerificationFailedSchema, {
    consumerId: reply.consumerId,
    orderId: reply.orderId,
    reason: toFailureReason(reply.reason),
  });
}

function toReplyMessage<Schema extends DescMessage>(
  schema: Schema,
  payload: MessageShape<Schema>,
  sagaId: string,
): OutboxMessage {
  return {
    topic: 'order.place-order-saga.replies',
    aggregateType: 'PlaceOrderSaga',
    aggregateId: sagaId,
    messageType: schema.typeName,
    payload: toBinary(schema, payload),
    sagaId,
  };
}

export function toConsumerReplyMessage(reply: ConsumerReply, sagaId: string): OutboxMessage {
  switch (reply.type) {
    case 'ConsumerVerified':
      return toReplyMessage(ConsumerVerifiedSchema, toConsumerVerified(reply), sagaId);
    case 'ConsumerVerificationFailed':
      return toReplyMessage(
        ConsumerVerificationFailedSchema,
        toConsumerVerificationFailed(reply),
        sagaId,
      );
  }
}
