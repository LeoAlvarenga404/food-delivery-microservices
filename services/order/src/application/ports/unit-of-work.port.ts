import type { Either } from '@fd/domain';
import type { RestaurantMenuRepository } from '#domain/menu/restaurant-menu.repository.ts';
import type { OrderRepository } from '#domain/order/order.repository.ts';
import type { CommandSender } from './command-sender.port.ts';
import type { IdempotencyKeyStore } from './idempotency-key-store.port.ts';
import type { PlaceOrderSagaRepository } from './place-order-saga-repository.port.ts';

export interface TransactionScope {
  readonly orders: OrderRepository;
  readonly menus: RestaurantMenuRepository;
  readonly sagas: PlaceOrderSagaRepository;
  readonly idempotencyKeys: IdempotencyKeyStore;
  readonly commands: CommandSender;
}

export interface MessageMetadata {
  readonly correlationId: string;
  readonly causationId: string | undefined;
  readonly actorId: string | undefined;
  readonly actorType: string | undefined;
}

export type TransactionalWork<Failure, Success> = (
  scope: TransactionScope,
) => Promise<Either<Failure, Success>>;

export interface UnitOfWork {
  execute<Failure, Success>(
    metadata: MessageMetadata,
    work: TransactionalWork<Failure, Success>,
  ): Promise<Either<Failure, Success>>;
}
