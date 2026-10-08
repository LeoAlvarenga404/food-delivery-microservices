import type { TransactionalMessageHandler } from '@fd/chassis-inbox';
import type { InboundMessage } from '@fd/chassis-kafka';
import { annotateActiveSpan, withCorrelation, type Logger } from '@fd/chassis-observability';
import { VoidAuthorizationSchema } from '@fd/contracts/fooddelivery/accounting/v1/commands_pb.js';
import type { Transaction } from 'kysely';
import { AuthorizePaymentCommandHandler } from '#application/commands/authorize-payment/authorize-payment.command-handler.ts';
import { VoidAuthorizationCommandHandler } from '#application/commands/void-authorization/void-authorization.command-handler.ts';
import type { Clock } from '#application/ports/clock.port.ts';
import type { IdGenerator } from '#application/ports/id-generator.port.ts';
import type { PaymentGateway } from '#application/ports/payment-gateway.port.ts';
import type { AccountingUnitOfWork } from '#infrastructure/persistence/accounting-unit-of-work.adapter.ts';
import type { DB as AccountingDatabase } from '#infrastructure/persistence/generated/database.ts';
import { toAuthorizePaymentCommand } from './authorize-payment.message-mapper.ts';
import { toVoidAuthorizationCommand } from './void-authorization.message-mapper.ts';

export interface AccountingCommandConsumerSettings {
  readonly unitOfWork: AccountingUnitOfWork;
  readonly paymentGateway: PaymentGateway;
  readonly idGenerator: IdGenerator;
  readonly clock: Clock;
  readonly logger: Logger;
}

type CommandConsumer = (
  settings: AccountingCommandConsumerSettings,
  message: InboundMessage,
  transaction: Transaction<AccountingDatabase>,
) => Promise<void>;

function correlatedLogger(
  settings: AccountingCommandConsumerSettings,
  message: InboundMessage,
  sagaId: string,
): Logger {
  const { messageId, correlationId, causationId } = message.headers;
  return withCorrelation(settings.logger, { correlationId, causationId, sagaId, messageId });
}

const authorizePayment: CommandConsumer = async (settings, message, transaction) => {
  const command = toAuthorizePaymentCommand(message);
  annotateActiveSpan({ orderId: command.orderId });
  const { paymentGateway, idGenerator, clock } = settings;
  const handler = new AuthorizePaymentCommandHandler({
    unitOfWork: settings.unitOfWork.joinedTo(transaction),
    paymentGateway,
    idGenerator,
    clock,
  });
  const outcome = await handler.execute(command);
  const logger = correlatedLogger(settings, message, command.sagaId);
  if (outcome.isRight()) logger.info({ reply: outcome.success }, 'AuthorizePayment answered');
};

const voidAuthorization: CommandConsumer = async (settings, message, transaction) => {
  const command = toVoidAuthorizationCommand(message);
  annotateActiveSpan({ orderId: command.orderId });
  const { paymentGateway, clock } = settings;
  const handler = new VoidAuthorizationCommandHandler({
    unitOfWork: settings.unitOfWork.joinedTo(transaction),
    paymentGateway,
    clock,
  });
  const outcome = await handler.execute(command);
  const logger = correlatedLogger(settings, message, command.sagaId);
  if (outcome.isRight()) logger.info({ reply: outcome.success }, 'VoidAuthorization answered');
};

export function accountingCommandConsumer(
  settings: AccountingCommandConsumerSettings,
): TransactionalMessageHandler<AccountingDatabase> {
  return async (message, transaction) => {
    const consume =
      message.headers.messageType === VoidAuthorizationSchema.typeName
        ? voidAuthorization
        : authorizePayment;
    await consume(settings, message, transaction);
  };
}
