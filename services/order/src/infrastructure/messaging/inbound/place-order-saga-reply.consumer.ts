import type { TransactionalMessageHandler } from '@fd/chassis-inbox';
import { PermanentMessageFailure, type InboundMessage } from '@fd/chassis-kafka';
import { withCorrelation, type Logger } from '@fd/chassis-observability';
import { metadataCausedBy } from '@fd/chassis-outbox';
import type { ApplyPlaceOrderSagaReplyError } from '#application/commands/apply-place-order-saga-reply/apply-place-order-saga-reply.command.ts';
import { ApplyPlaceOrderSagaReplyCommandHandler } from '#application/commands/apply-place-order-saga-reply/apply-place-order-saga-reply.command-handler.ts';
import type { Clock } from '#application/ports/clock.port.ts';
import type { DB as OrderDatabase } from '#infrastructure/persistence/generated/database.ts';
import {
  joinTransaction,
  type OrderUnitOfWork,
} from '#infrastructure/persistence/order-unit-of-work.adapter.ts';
import { toPlaceOrderSagaReply } from './place-order-saga-reply.message-mapper.ts';

export interface PlaceOrderSagaReplyConsumerSettings {
  readonly unitOfWork: OrderUnitOfWork;
  readonly clock: Clock;
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

export function placeOrderSagaReplyConsumer(
  settings: PlaceOrderSagaReplyConsumerSettings,
): TransactionalMessageHandler<OrderDatabase> {
  return async (message, transaction) => {
    const sagaId = readSagaId(message);
    const reply = toPlaceOrderSagaReply(message);
    const { messageId, correlationId, causationId } = message.headers;
    const logger = withCorrelation(settings.logger, {
      correlationId,
      causationId,
      sagaId,
      messageId,
    });
    const unitOfWork = joinTransaction(settings.unitOfWork, transaction);
    const handler = new ApplyPlaceOrderSagaReplyCommandHandler(unitOfWork, settings.clock);
    const outcome = await handler.execute({
      sagaId,
      reply,
      metadata: metadataCausedBy(message.headers),
    });
    if (outcome.isLeft()) {
      throwWhenSagaIsUnknown(outcome.failure);
      logger.warn({ failure: outcome.failure }, 'place order saga reply ignored');
      return;
    }
    logger.info({ replyType: reply.type }, 'place order saga reply applied');
  };
}
