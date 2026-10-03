import { fromBinary, type DescMessage } from '@bufbuild/protobuf';
import { PermanentMessageFailure, type InboundMessage } from '@fd/chassis-kafka';
import { PaymentAuthorizedSchema } from '@fd/contracts/fooddelivery/accounting/v1/replies_pb.js';
import { ConsumerVerifiedSchema } from '@fd/contracts/fooddelivery/consumer/v1/replies_pb.js';
import {
  TicketApprovedSchema,
  TicketCreatedSchema,
} from '@fd/contracts/fooddelivery/kitchen/v1/replies_pb.js';
import type {
  PlaceOrderSagaReply,
  PlaceOrderSagaReplyType,
} from '#application/sagas/place-order/place-order.saga.ts';

interface ReplyContract {
  readonly schema: DescMessage;
  readonly replyType: PlaceOrderSagaReplyType;
}

const replyContracts: readonly ReplyContract[] = [
  { schema: ConsumerVerifiedSchema, replyType: 'ConsumerVerified' },
  { schema: TicketCreatedSchema, replyType: 'TicketCreated' },
  { schema: PaymentAuthorizedSchema, replyType: 'PaymentAuthorized' },
  { schema: TicketApprovedSchema, replyType: 'TicketApproved' },
];

function assertDecodable(schema: DescMessage, payload: Uint8Array): void {
  try {
    fromBinary(schema, payload);
  } catch (error) {
    throw new PermanentMessageFailure(`payload is not a valid ${schema.typeName}`, {
      cause: error,
    });
  }
}

export function toPlaceOrderSagaReply(message: InboundMessage): PlaceOrderSagaReply {
  const { messageType } = message.headers;
  const contract = replyContracts.find(({ schema }) => schema.typeName === messageType);
  if (contract === undefined) {
    throw new PermanentMessageFailure(`unknown place order saga reply ${messageType}`);
  }
  assertDecodable(contract.schema, message.payload);
  return { type: contract.replyType };
}
