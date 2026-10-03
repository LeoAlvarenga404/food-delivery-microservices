import type { TransactionalMessageHandler } from '@fd/chassis-inbox';
import { withCorrelation, type Logger } from '@fd/chassis-observability';
import { VerifyConsumerCommandHandler } from '#application/commands/verify-consumer/verify-consumer.command-handler.ts';
import {
  joinTransaction,
  type ConsumerUnitOfWork,
} from '#infrastructure/persistence/consumer-unit-of-work.adapter.ts';
import type { DB as ConsumerDatabase } from '#infrastructure/persistence/generated/database.ts';
import { toVerifyConsumerCommand } from './verify-consumer.message-mapper.ts';

export interface ConsumerCommandConsumerSettings {
  readonly unitOfWork: ConsumerUnitOfWork;
  readonly logger: Logger;
}

export function consumerCommandConsumer(
  settings: ConsumerCommandConsumerSettings,
): TransactionalMessageHandler<ConsumerDatabase> {
  return async (message, transaction) => {
    const command = toVerifyConsumerCommand(message);
    const { messageId, correlationId, causationId } = message.headers;
    const logger = withCorrelation(settings.logger, {
      correlationId,
      causationId,
      sagaId: command.sagaId,
      messageId,
    });
    const unitOfWork = joinTransaction(settings.unitOfWork, transaction);
    const outcome = await new VerifyConsumerCommandHandler(unitOfWork).execute(command);
    if (outcome.isRight()) logger.info({ reply: outcome.success }, 'VerifyConsumer answered');
  };
}
