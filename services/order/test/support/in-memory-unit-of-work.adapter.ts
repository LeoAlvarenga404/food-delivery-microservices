import type { Either } from '@fd/domain';
import type {
  MessageMetadata,
  TransactionScope,
  TransactionalWork,
  UnitOfWork,
} from '#application/ports/unit-of-work.port.ts';
import { FakeCommandSender } from './command-sender.fake.ts';
import { InMemoryIdempotencyKeyStore } from './in-memory-idempotency-key-store.adapter.ts';
import { InMemoryOrderRepository } from './in-memory-order.repository.ts';
import { InMemoryPlaceOrderSagaRepository } from './in-memory-place-order-saga.repository.ts';
import { InMemoryRestaurantMenuRepository } from './in-memory-restaurant-menu.repository.ts';

function restoreRows<Row>(table: Map<string, Row>, savedRows: ReadonlyMap<string, Row>): void {
  table.clear();
  savedRows.forEach((row, key) => table.set(key, row));
}

export class InMemoryUnitOfWork implements UnitOfWork, TransactionScope {
  readonly orders = new InMemoryOrderRepository();
  readonly menus = new InMemoryRestaurantMenuRepository();
  readonly sagas = new InMemoryPlaceOrderSagaRepository();
  readonly idempotencyKeys = new InMemoryIdempotencyKeyStore();
  readonly commands = new FakeCommandSender();
  readonly executedMetadata: MessageMetadata[] = [];

  async execute<Failure, Success>(
    metadata: MessageMetadata,
    work: TransactionalWork<Failure, Success>,
  ): Promise<Either<Failure, Success>> {
    this.executedMetadata.push(metadata);
    const rollBack = this.#takeSavepoint();
    try {
      const outcome = await work(this);
      if (outcome.isLeft()) rollBack();
      return outcome;
    } catch (error) {
      rollBack();
      throw error;
    }
  }

  #takeSavepoint(): () => void {
    const orderRows = new Map(this.orders.rows);
    const sagaRows = new Map(this.sagas.rows);
    const idempotencyKeyRows = new Map(this.idempotencyKeys.rows);
    const sentCommandCount = this.commands.sentCommands.length;
    return () => {
      restoreRows(this.orders.rows, orderRows);
      restoreRows(this.sagas.rows, sagaRows);
      restoreRows(this.idempotencyKeys.rows, idempotencyKeyRows);
      this.commands.sentCommands.splice(sentCommandCount);
    };
  }
}
