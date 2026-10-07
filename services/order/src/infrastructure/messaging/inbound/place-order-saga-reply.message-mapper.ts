import { fromBinary, type DescMessage, type MessageShape } from '@bufbuild/protobuf';
import { PermanentMessageFailure, type InboundMessage } from '@fd/chassis-kafka';
import {
  AuthorizationVoidedSchema,
  PaymentAuthorizedSchema,
  PaymentFailedSchema,
  PaymentFailureReason,
} from '@fd/contracts/fooddelivery/accounting/v1/replies_pb.js';
import {
  ConsumerVerificationFailedSchema,
  ConsumerVerificationFailureReason,
  ConsumerVerifiedSchema,
} from '@fd/contracts/fooddelivery/consumer/v1/replies_pb.js';
import {
  TicketApprovedSchema,
  TicketCreatedSchema,
  TicketCreationFailedSchema,
  TicketCreationFailureReason,
  TicketRejectedSchema,
} from '@fd/contracts/fooddelivery/kitchen/v1/replies_pb.js';
import type {
  FailureReply,
  PlaceOrderSagaReply,
  SuccessReply,
} from '#application/sagas/place-order/place-order.saga-state.ts';
import type { OrderRejectionReason } from '#domain/order/order.state.ts';

export interface ReceivedPlaceOrderSagaReply {
  readonly orderId: string;
  readonly reply: PlaceOrderSagaReply;
}

type ReplyReader = (payload: Uint8Array) => ReceivedPlaceOrderSagaReply;

const consumerRejectionReasons = new Map<ConsumerVerificationFailureReason, OrderRejectionReason>([
  [ConsumerVerificationFailureReason.CONSUMER_NOT_FOUND, 'CONSUMER_NOT_FOUND'],
  [ConsumerVerificationFailureReason.CONSUMER_BLOCKED, 'CONSUMER_BLOCKED'],
]);

const kitchenRejectionReasons = new Map<TicketCreationFailureReason, OrderRejectionReason>([
  [TicketCreationFailureReason.EMPTY_TICKET, 'TICKET_REFUSED'],
  [TicketCreationFailureReason.INVALID_QUANTITY, 'TICKET_REFUSED'],
]);

const accountingRejectionReasons = new Map<PaymentFailureReason, OrderRejectionReason>([
  [PaymentFailureReason.PAYMENT_DECLINED, 'PAYMENT_DECLINED'],
]);

function decode<Schema extends DescMessage>(
  schema: Schema,
  payload: Uint8Array,
): MessageShape<Schema> {
  try {
    return fromBinary(schema, payload);
  } catch (error) {
    throw new PermanentMessageFailure(`payload is not a valid ${schema.typeName}`, {
      cause: error,
    });
  }
}

function succeeded(
  decoded: { readonly orderId: string },
  type: SuccessReply['type'],
): ReceivedPlaceOrderSagaReply {
  return { orderId: decoded.orderId, reply: { type } };
}

function failed(
  decoded: { readonly orderId: string },
  type: FailureReply['type'],
  rejectionReason: OrderRejectionReason | undefined,
): ReceivedPlaceOrderSagaReply {
  if (rejectionReason === undefined) {
    throw new PermanentMessageFailure(`${type} without a reason the saga knows`);
  }
  return { orderId: decoded.orderId, reply: { type, rejectionReason } };
}

const replyReaders = new Map<string, ReplyReader>([
  [
    ConsumerVerifiedSchema.typeName,
    (payload) => succeeded(decode(ConsumerVerifiedSchema, payload), 'ConsumerVerified'),
  ],
  [
    ConsumerVerificationFailedSchema.typeName,
    (payload) => {
      const reply = decode(ConsumerVerificationFailedSchema, payload);
      return failed(
        reply,
        'ConsumerVerificationFailed',
        consumerRejectionReasons.get(reply.reason),
      );
    },
  ],
  [
    TicketCreatedSchema.typeName,
    (payload) => succeeded(decode(TicketCreatedSchema, payload), 'TicketCreated'),
  ],
  [
    TicketCreationFailedSchema.typeName,
    (payload) => {
      const reply = decode(TicketCreationFailedSchema, payload);
      return failed(reply, 'TicketCreationFailed', kitchenRejectionReasons.get(reply.reason));
    },
  ],
  [
    PaymentAuthorizedSchema.typeName,
    (payload) => succeeded(decode(PaymentAuthorizedSchema, payload), 'PaymentAuthorized'),
  ],
  [
    PaymentFailedSchema.typeName,
    (payload) => {
      const reply = decode(PaymentFailedSchema, payload);
      return failed(reply, 'PaymentFailed', accountingRejectionReasons.get(reply.reason));
    },
  ],
  [
    TicketApprovedSchema.typeName,
    (payload) => succeeded(decode(TicketApprovedSchema, payload), 'TicketApproved'),
  ],
  [
    TicketRejectedSchema.typeName,
    (payload) => succeeded(decode(TicketRejectedSchema, payload), 'TicketRejected'),
  ],
  [
    AuthorizationVoidedSchema.typeName,
    (payload) => succeeded(decode(AuthorizationVoidedSchema, payload), 'AuthorizationVoided'),
  ],
]);

export function toPlaceOrderSagaReply(message: InboundMessage): ReceivedPlaceOrderSagaReply {
  const { messageType } = message.headers;
  const readReply = replyReaders.get(messageType);
  if (readReply === undefined) {
    throw new PermanentMessageFailure(`unknown place order saga reply ${messageType}`);
  }
  return readReply(message.payload);
}
