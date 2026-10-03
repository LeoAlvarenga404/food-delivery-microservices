import { fromBinary } from '@bufbuild/protobuf';
import { PermanentMessageFailure, type InboundMessage } from '@fd/chassis-kafka';
import { metadataCausedBy } from '@fd/chassis-outbox';
import {
  AuthorizePaymentSchema,
  type AuthorizePayment,
} from '@fd/contracts/fooddelivery/accounting/v1/commands_pb.js';
import { isUuid } from '@fd/domain';
import type { AuthorizePaymentCommand } from '#application/commands/authorize-payment/authorize-payment.command.ts';
import { parseOrderId, type OrderId } from '#domain/payment/order-id.value-object.ts';

function decodeAuthorizePayment(message: InboundMessage): AuthorizePayment {
  const { messageType } = message.headers;
  if (messageType !== AuthorizePaymentSchema.typeName) {
    throw new PermanentMessageFailure(`unknown accounting command ${messageType}`);
  }
  try {
    return fromBinary(AuthorizePaymentSchema, message.payload);
  } catch (error) {
    throw new PermanentMessageFailure(`payload is not a valid ${messageType}`, { cause: error });
  }
}

function requireOrderId(rawOrderId: string): OrderId {
  const orderId = parseOrderId(rawOrderId);
  if (orderId.isLeft()) {
    throw new PermanentMessageFailure('AuthorizePayment without a valid order id');
  }
  return orderId.success;
}

export function toAuthorizePaymentCommand(message: InboundMessage): AuthorizePaymentCommand {
  const { sagaId } = message.headers;
  if (sagaId === undefined) throw new PermanentMessageFailure('command without saga-id header');
  const { orderId, consumerId, amountInCents, currency, paymentToken } =
    decodeAuthorizePayment(message);
  if (!isUuid(consumerId)) {
    throw new PermanentMessageFailure('AuthorizePayment without a valid consumer id');
  }
  if (amountInCents <= 0n) throw new PermanentMessageFailure('AuthorizePayment without an amount');
  if (currency !== 'BRL') throw new PermanentMessageFailure(`unsupported currency ${currency}`);
  if (paymentToken.length === 0) {
    throw new PermanentMessageFailure('AuthorizePayment without a payment token');
  }
  return {
    orderId: requireOrderId(orderId),
    consumerId: consumerId.toLowerCase(),
    amountInCents,
    currency,
    paymentToken,
    sagaId,
    metadata: metadataCausedBy(message.headers),
  };
}
