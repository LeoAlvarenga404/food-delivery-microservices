import type { TransactionalMessageHandler } from '@fd/chassis-inbox';
import { PermanentMessageFailure, type InboundMessage } from '@fd/chassis-kafka';
import { annotateActiveSpan, withCorrelation, type Logger } from '@fd/chassis-observability';
import { metadataCausedBy } from '@fd/chassis-outbox';
import type { Transaction } from 'kysely';
import type { ApplyPlaceOrderSagaReplyError } from '#application/commands/apply-place-order-saga-reply/apply-place-order-saga-reply.command.ts';
import { ApplyPlaceOrderSagaReplyCommandHandler } from '#application/commands/apply-place-order-saga-reply/apply-place-order-saga-reply.command-handler.ts';
import type { Clock } from '#application/ports/clock.port.ts';
import type { PlaceOrderSagaTimeoutsInMilliseconds } from '#application/sagas/place-order/place-order-saga-deadline.saga.ts';
import type { DB as OrderDatabase } from '#infrastructure/persistence/generated/database.ts';
import type { OrderUnitOfWork } from '#infrastructure/persistence/order-unit-of-work.adapter.ts';
import { toPlaceOrderSagaReply } from './place-order-saga-reply.message-mapper.ts';

export interface PlaceOrderSagaReplyConsumerSettings {
  readonly unitOfWork: OrderUnitOfWork;
  readonly clock: Clock;
  readonly sagaTimeoutsInMilliseconds: PlaceOrderSagaTimeoutsInMilliseconds;
  readonly logger: Logger;
}

function readSagaId(message: InboundMessage): string {
  const { sagaId } = message.headers;
  if (sagaId === undefined) throw new PermanentMessageFailure('reply without saga-id header');
  return sagaId;
}

function throwWhenSagaIsUnknown(failure: ApplyPlaceOrderSagaReplyError): void {
  if (failure.type === 'SagaNotFound') {
    throw new PermanentMessageFailure(`no place order saga ${failure.sagaId}`);
  }
}

function createReplyHandler(
  settings: PlaceOrderSagaReplyConsumerSettings,
  transaction: Transaction<OrderDatabase>,
): ApplyPlaceOrderSagaReplyCommandHandler {
  return new ApplyPlaceOrderSagaReplyCommandHandler(
    settings.unitOfWork.joinedTo(transaction),
    settings.clock,
    settings.sagaTimeoutsInMilliseconds,
  );
}

export function placeOrderSagaReplyConsumer(
  settings: PlaceOrderSagaReplyConsumerSettings,
): TransactionalMessageHandler<OrderDatabase> {
  return async (message, transaction) => {
    const sagaId = readSagaId(message);
    const { orderId, reply } = toPlaceOrderSagaReply(message);
    annotateActiveSpan({ orderId });
    const { messageId, correlationId, causationId } = message.headers;
    const logger = withCorrelation(settings.logger, {
      correlationId,
      causationId,
      sagaId,
      messageId,
    }).child({ orderId });
    const outcome = await createReplyHandler(settings, transaction).execute({
      sagaId,
      reply,
      metadata: metadataCausedBy(message.headers),
    });
    if (outcome.isLeft()) {
      throwWhenSagaIsUnknown(outcome.failure);
      logger.warn({ failure: outcome.failure }, 'place order saga reply ignored');
      return;
    }
    logger.info({ reply }, 'place order saga reply applied');
  };
}
