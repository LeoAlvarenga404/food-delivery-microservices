import { fromBinary } from '@bufbuild/protobuf';
import { PermanentMessageFailure, type InboundMessage } from '@fd/chassis-kafka';
import { metadataCausedBy } from '@fd/chassis-outbox';
import {
  AuthorizePaymentSchema,
  type AuthorizePayment,
} from '@fd/contracts/fooddelivery/accounting/v1/commands_pb.js';
import type { Either } from '@fd/domain';
import type { AuthorizePaymentCommand } from '#application/commands/authorize-payment/authorize-payment.command.ts';
import { parseConsumerId } from '#domain/payment/consumer-id.value-object.ts';
import { parseMoney } from '#domain/payment/money.value-object.ts';
import { parseOrderId } from '#domain/payment/order-id.value-object.ts';
import { parseRestaurantId } from '#domain/payment/restaurant-id.value-object.ts';

type PaymentAmounts = Pick<AuthorizePaymentCommand, 'amount' | 'deliveryFee'>;

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

function requireField<Field>(parsed: Either<unknown, Field>, fieldName: string): Field {
  if (parsed.isLeft())
    throw new PermanentMessageFailure(`AuthorizePayment without a valid ${fieldName}`);
  return parsed.success;
}

function requireAmounts(authorizePayment: AuthorizePayment): PaymentAmounts {
  const { amountInCents, deliveryFeeInCents, currency } = authorizePayment;
  if (amountInCents <= 0n) throw new PermanentMessageFailure('AuthorizePayment without an amount');
  if (deliveryFeeInCents >= amountInCents) {
    throw new PermanentMessageFailure('AuthorizePayment with a delivery fee that leaves no food');
  }
  return {
    amount: requireField(parseMoney(amountInCents, currency), 'amount'),
    deliveryFee: requireField(parseMoney(deliveryFeeInCents, currency), 'delivery fee'),
  };
}

export function toAuthorizePaymentCommand(message: InboundMessage): AuthorizePaymentCommand {
  const { sagaId } = message.headers;
  if (sagaId === undefined) throw new PermanentMessageFailure('command without saga-id header');
  const authorizePayment = decodeAuthorizePayment(message);
  const { orderId, consumerId, restaurantId, paymentToken } = authorizePayment;
  if (paymentToken.length === 0) {
    throw new PermanentMessageFailure('AuthorizePayment without a payment token');
  }
  return {
    orderId: requireField(parseOrderId(orderId), 'order id'),
    consumerId: requireField(parseConsumerId(consumerId), 'consumer id'),
    restaurantId: requireField(parseRestaurantId(restaurantId), 'restaurant id'),
    ...requireAmounts(authorizePayment),
    paymentToken,
    sagaId,
    metadata: metadataCausedBy(message.headers),
  };
}
