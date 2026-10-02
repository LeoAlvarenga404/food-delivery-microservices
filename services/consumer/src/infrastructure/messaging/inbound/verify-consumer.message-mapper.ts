import { fromBinary } from '@bufbuild/protobuf';
import { PermanentMessageFailure, type InboundMessage } from '@fd/chassis-kafka';
import { metadataCausedBy } from '@fd/chassis-outbox';
import {
  VerifyConsumerSchema,
  type VerifyConsumer,
} from '@fd/contracts/fooddelivery/consumer/v1/commands_pb.js';
import { isUuid } from '@fd/domain';
import type { VerifyConsumerCommand } from '#application/commands/verify-consumer/verify-consumer.command.ts';
import { parseConsumerId } from '#domain/consumer/consumer-id.value-object.ts';

function decodeVerifyConsumer(message: InboundMessage): VerifyConsumer {
  const { messageType } = message.headers;
  if (messageType !== VerifyConsumerSchema.typeName) {
    throw new PermanentMessageFailure(`unknown consumer command ${messageType}`);
  }
  try {
    return fromBinary(VerifyConsumerSchema, message.payload);
  } catch (error) {
    throw new PermanentMessageFailure(`payload is not a valid ${messageType}`, { cause: error });
  }
}

export function toVerifyConsumerCommand(message: InboundMessage): VerifyConsumerCommand {
  const { sagaId } = message.headers;
  if (sagaId === undefined) throw new PermanentMessageFailure('command without saga-id header');
  const verifyConsumer = decodeVerifyConsumer(message);
  const consumerId = parseConsumerId(verifyConsumer.consumerId);
  if (consumerId.isLeft()) {
    throw new PermanentMessageFailure('VerifyConsumer without a valid consumer id');
  }
  if (!isUuid(verifyConsumer.orderId)) {
    throw new PermanentMessageFailure('VerifyConsumer without a valid order id');
  }
  return {
    consumerId: consumerId.success,
    orderId: verifyConsumer.orderId.toLowerCase(),
    sagaId,
    metadata: metadataCausedBy(message.headers),
  };
}
