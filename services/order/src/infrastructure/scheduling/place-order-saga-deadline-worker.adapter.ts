import { withCorrelation, type Logger } from '@fd/chassis-observability';
import { runInTransaction } from '@fd/chassis-postgres';
import type { Kysely, Transaction } from 'kysely';
import { ApplyPlaceOrderSagaReplyCommandHandler } from '#application/commands/apply-place-order-saga-reply/apply-place-order-saga-reply.command-handler.ts';
import type { Clock } from '#application/ports/clock.port.ts';
import type { MessageMetadata } from '#application/ports/unit-of-work.port.ts';
import type { PlaceOrderSagaTimeoutsInMilliseconds } from '#application/sagas/place-order/place-order-saga-deadline.saga.ts';
import type { DB as OrderDatabase } from '#infrastructure/persistence/generated/database.ts';
import type { OrderUnitOfWork } from '#infrastructure/persistence/order-unit-of-work.adapter.ts';
import {
  PostgresPlaceOrderSagaRepository,
  type ExpiredSaga,
} from '#infrastructure/persistence/postgres-place-order-saga.repository.ts';

export interface PlaceOrderSagaDeadlineWorkerSettings {
  readonly database: Kysely<OrderDatabase>;
  readonly unitOfWork: OrderUnitOfWork;
  readonly clock: Clock;
  readonly sagaTimeoutsInMilliseconds: PlaceOrderSagaTimeoutsInMilliseconds;
  readonly generateCorrelationId: () => string;
  readonly logger: Logger;
}

const expiredSagaBatchSize = 100;
const failedTimeoutRetryDelayInMilliseconds = 60_000;

function timeoutMetadata(correlationId: string): MessageMetadata {
  return {
    correlationId,
    causationId: undefined,
    actorId: undefined,
    actorType: undefined,
  };
}

export class PlaceOrderSagaDeadlineWorker {
  readonly #settings: PlaceOrderSagaDeadlineWorkerSettings;

  constructor(settings: PlaceOrderSagaDeadlineWorkerSettings) {
    this.#settings = settings;
  }

  async timeOutExpiredSteps(): Promise<number> {
    const { database, clock } = this.#settings;
    return runInTransaction(database, async (transaction) => {
      const sagas = new PostgresPlaceOrderSagaRepository(transaction);
      const expiredSagas = await sagas.lockExpiredSagas(clock.now(), expiredSagaBatchSize);
      for (const expired of expiredSagas) await this.#timeOut(transaction, expired);
      return expiredSagas.length;
    });
  }

  async #timeOut(transaction: Transaction<OrderDatabase>, expired: ExpiredSaga): Promise<void> {
    const { sagaId, orderId } = expired;
    const correlationId = this.#settings.generateCorrelationId();
    const logger = withCorrelation(this.#settings.logger, { correlationId, sagaId }).child({
      orderId,
    });
    try {
      const outcome = await this.#replyHandler(transaction).execute({
        sagaId,
        reply: { type: 'StepTimedOut' },
        metadata: timeoutMetadata(correlationId),
      });
      if (outcome.isRight()) {
        logger.info('place order saga step timed out');
        return;
      }
      logger.warn({ failure: outcome.failure }, 'place order saga timeout ignored');
    } catch (error) {
      logger.error({ err: error }, 'place order saga timeout failed');
    }
    await this.#postpone(transaction, sagaId);
  }

  async #postpone(transaction: Transaction<OrderDatabase>, sagaId: string): Promise<void> {
    const retryAt = new Date(
      this.#settings.clock.now().getTime() + failedTimeoutRetryDelayInMilliseconds,
    );
    await new PostgresPlaceOrderSagaRepository(transaction).postponeDeadline(sagaId, retryAt);
  }

  #replyHandler(transaction: Transaction<OrderDatabase>): ApplyPlaceOrderSagaReplyCommandHandler {
    const { unitOfWork, clock, sagaTimeoutsInMilliseconds } = this.#settings;
    return new ApplyPlaceOrderSagaReplyCommandHandler(
      unitOfWork.joinedTo(transaction),
      clock,
      sagaTimeoutsInMilliseconds,
    );
  }
}
