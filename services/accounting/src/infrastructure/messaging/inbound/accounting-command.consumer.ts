import type { TransactionalMessageHandler } from '@fd/chassis-inbox';
import { withCorrelation, type Logger } from '@fd/chassis-observability';
import { AuthorizePaymentCommandHandler } from '#application/commands/authorize-payment/authorize-payment.command-handler.ts';
import type { Clock } from '#application/ports/clock.port.ts';
import type { IdGenerator } from '#application/ports/id-generator.port.ts';
import type { PaymentGateway } from '#application/ports/payment-gateway.port.ts';
import type { AccountingUnitOfWork } from '#infrastructure/persistence/accounting-unit-of-work.adapter.ts';
import type { DB as AccountingDatabase } from '#infrastructure/persistence/generated/database.ts';
import { toAuthorizePaymentCommand } from './authorize-payment.message-mapper.ts';

export interface AccountingCommandConsumerSettings {
  readonly unitOfWork: AccountingUnitOfWork;
  readonly paymentGateway: PaymentGateway;
  readonly idGenerator: IdGenerator;
  readonly clock: Clock;
  readonly logger: Logger;
}

export function accountingCommandConsumer(
  settings: AccountingCommandConsumerSettings,
): TransactionalMessageHandler<AccountingDatabase> {
  return async (message, transaction) => {
    const command = toAuthorizePaymentCommand(message);
    const { messageId, correlationId, causationId } = message.headers;
    const logger = withCorrelation(settings.logger, {
      correlationId,
      causationId,
      sagaId: command.sagaId,
      messageId,
    });
    const { paymentGateway, idGenerator, clock } = settings;
    const handler = new AuthorizePaymentCommandHandler({
      unitOfWork: settings.unitOfWork.joinedTo(transaction),
      paymentGateway,
      idGenerator,
      clock,
    });
    const outcome = await handler.execute(command);
    if (outcome.isRight()) logger.info({ reply: outcome.success }, 'AuthorizePayment answered');
  };
}
