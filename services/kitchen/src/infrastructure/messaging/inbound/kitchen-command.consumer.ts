import type { TransactionalMessageHandler } from '@fd/chassis-inbox';
import { annotateActiveSpan, withCorrelation, type Logger } from '@fd/chassis-observability';
import type { Either } from '@fd/domain';
import type { ApproveTicketError } from '#application/commands/approve-ticket/approve-ticket.command.ts';
import { ApproveTicketCommandHandler } from '#application/commands/approve-ticket/approve-ticket.command-handler.ts';
import { CreateTicketCommandHandler } from '#application/commands/create-ticket/create-ticket.command-handler.ts';
import type { RejectTicketError } from '#application/commands/reject-ticket/reject-ticket.command.ts';
import { RejectTicketCommandHandler } from '#application/commands/reject-ticket/reject-ticket.command-handler.ts';
import type { IdGenerator } from '#application/ports/id-generator.port.ts';
import type { KitchenReply } from '#application/ports/reply-sender.port.ts';
import type { UnitOfWork } from '#application/ports/unit-of-work.port.ts';
import type { DB as KitchenDatabase } from '#infrastructure/persistence/generated/database.ts';
import type { KitchenUnitOfWork } from '#infrastructure/persistence/kitchen-unit-of-work.adapter.ts';
import { toKitchenCommand, type KitchenCommand } from './kitchen-command.message-mapper.ts';

export interface KitchenCommandConsumerSettings {
  readonly unitOfWork: KitchenUnitOfWork;
  readonly idGenerator: IdGenerator;
  readonly logger: Logger;
}

function carryOut(
  kitchenCommand: KitchenCommand,
  unitOfWork: UnitOfWork,
  idGenerator: IdGenerator,
): Promise<Either<ApproveTicketError | RejectTicketError, KitchenReply>> {
  switch (kitchenCommand.type) {
    case 'CreateTicket':
      return new CreateTicketCommandHandler(unitOfWork, idGenerator).execute(
        kitchenCommand.command,
      );
    case 'ApproveTicket':
      return new ApproveTicketCommandHandler(unitOfWork).execute(kitchenCommand.command);
    case 'RejectTicket':
      return new RejectTicketCommandHandler(unitOfWork).execute(kitchenCommand.command);
  }
}

export function kitchenCommandConsumer(
  settings: KitchenCommandConsumerSettings,
): TransactionalMessageHandler<KitchenDatabase> {
  return async (message, transaction) => {
    const kitchenCommand = toKitchenCommand(message);
    annotateActiveSpan({ orderId: kitchenCommand.command.orderId });
    const { messageId, correlationId, causationId } = message.headers;
    const logger = withCorrelation(settings.logger, {
      correlationId,
      causationId,
      sagaId: kitchenCommand.command.sagaId,
      messageId,
    });
    const unitOfWork = settings.unitOfWork.joinedTo(transaction);
    const outcome = await carryOut(kitchenCommand, unitOfWork, settings.idGenerator);
    if (outcome.isLeft()) {
      logger.warn({ failure: outcome.failure }, `${kitchenCommand.type} refused, no reply sent`);
      return;
    }
    logger.info({ reply: outcome.success }, `${kitchenCommand.type} carried out`);
  };
}
