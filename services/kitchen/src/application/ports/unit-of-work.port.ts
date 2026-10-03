import type { Either } from '@fd/domain';
import type { TicketRepository } from '#domain/ticket/ticket.repository.ts';
import type { ReplySender } from './reply-sender.port.ts';

export interface TransactionScope {
  readonly tickets: TicketRepository;
  readonly replies: ReplySender;
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
