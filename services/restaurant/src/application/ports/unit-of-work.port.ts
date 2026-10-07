import type { Either } from '@fd/domain';
import type { RestaurantRepository } from '#domain/restaurant/restaurant.repository.ts';

export interface TransactionScope {
  readonly restaurants: RestaurantRepository;
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
