import type { MessageMetadata } from '#application/ports/unit-of-work.port.ts';
import type { UnexpectedSagaReply } from '#application/sagas/place-order/place-order.saga.ts';
import type { PlaceOrderSagaReply } from '#application/sagas/place-order/place-order.saga-state.ts';
import type { InvalidOrderTransition } from '#domain/order/order.errors.ts';

export interface ApplyPlaceOrderSagaReplyCommand {
  readonly sagaId: string;
  readonly reply: PlaceOrderSagaReply;
  readonly metadata: MessageMetadata;
}

export interface SagaNotFound {
  readonly type: 'SagaNotFound';
  readonly sagaId: string;
}

export type ApplyPlaceOrderSagaReplyError =
  SagaNotFound | UnexpectedSagaReply | InvalidOrderTransition;
