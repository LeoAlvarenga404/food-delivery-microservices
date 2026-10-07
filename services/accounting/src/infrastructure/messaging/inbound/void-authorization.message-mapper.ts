import { fromBinary } from '@bufbuild/protobuf';
import { PermanentMessageFailure, type InboundMessage } from '@fd/chassis-kafka';
import { metadataCausedBy } from '@fd/chassis-outbox';
import {
  VoidAuthorizationSchema,
  type VoidAuthorization,
} from '@fd/contracts/fooddelivery/accounting/v1/commands_pb.js';
import type { VoidAuthorizationCommand } from '#application/commands/void-authorization/void-authorization.command.ts';
import { parseOrderId } from '#domain/payment/order-id.value-object.ts';

function decodeVoidAuthorization(message: InboundMessage): VoidAuthorization {
  try {
    return fromBinary(VoidAuthorizationSchema, message.payload);
  } catch (error) {
    throw new PermanentMessageFailure(
      `payload is not a valid ${VoidAuthorizationSchema.typeName}`,
      {
        cause: error,
      },
    );
  }
}

export function toVoidAuthorizationCommand(message: InboundMessage): VoidAuthorizationCommand {
  const { sagaId } = message.headers;
  if (sagaId === undefined) throw new PermanentMessageFailure('command without saga-id header');
  const orderId = parseOrderId(decodeVoidAuthorization(message).orderId);
  if (orderId.isLeft()) {
    throw new PermanentMessageFailure('VoidAuthorization without a valid order id');
  }
  return { orderId: orderId.success, sagaId, metadata: metadataCausedBy(message.headers) };
}
