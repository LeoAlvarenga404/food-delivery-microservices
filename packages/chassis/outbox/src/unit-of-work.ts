import { runInTransaction } from '@fd/chassis-postgres';
import type { AggregateRoot, DomainEvent, Either } from '@fd/domain';
import { sql, type Kysely, type Transaction } from 'kysely';
import type { MessageMetadata, OutboxMessage } from './outbox-message.ts';
import { writeOutboxMessages } from './write-outbox-messages.ts';

export interface UnitOfWorkContext<Schema, RecordedEvent extends DomainEvent> {
  readonly transaction: Transaction<Schema>;
  readonly track: (aggregate: AggregateRoot<RecordedEvent>) => void;
  readonly enqueue: (message: OutboxMessage) => void;
}

export interface UnitOfWorkSettings<Schema, Repositories, RecordedEvent extends DomainEvent> {
  readonly database: Kysely<Schema>;
  readonly createRepositories: (context: UnitOfWorkContext<Schema, RecordedEvent>) => Repositories;
  readonly toOutboxMessages: (event: RecordedEvent) => readonly OutboxMessage[];
  readonly generateMessageId: () => string;
  readonly now: () => Date;
}

export type Work<Repositories, Failure, Success> = (
  repositories: Repositories,
) => Promise<Either<Failure, Success>>;

interface OutgoingMessageCollector<RecordedEvent extends DomainEvent> {
  readonly trackedAggregates: AggregateRoot<RecordedEvent>[];
  readonly enqueuedMessages: OutboxMessage[];
}

export class UnitOfWork<Schema, Repositories, RecordedEvent extends DomainEvent> {
  readonly #settings: UnitOfWorkSettings<Schema, Repositories, RecordedEvent>;

  constructor(settings: UnitOfWorkSettings<Schema, Repositories, RecordedEvent>) {
    this.#settings = settings;
  }

  async execute<Failure, Success>(
    metadata: MessageMetadata,
    work: Work<Repositories, Failure, Success>,
  ): Promise<Either<Failure, Success>> {
    return runInTransaction(this.#settings.database, (transaction) =>
      this.executeWithin(transaction, metadata, work),
    );
  }

  async executeWithin<Failure, Success>(
    transaction: Transaction<Schema>,
    metadata: MessageMetadata,
    work: Work<Repositories, Failure, Success>,
  ): Promise<Either<Failure, Success>> {
    await sql`savepoint unit_of_work`.execute(transaction);
    const collector: OutgoingMessageCollector<RecordedEvent> = {
      trackedAggregates: [],
      enqueuedMessages: [],
    };
    const outcome = await work(this.#createRepositories(transaction, collector));
    if (outcome.isLeft()) {
      await sql`rollback to savepoint unit_of_work`.execute(transaction);
      await sql`release savepoint unit_of_work`.execute(transaction);
      return outcome;
    }
    await writeOutboxMessages(transaction, this.#outgoingMessages(collector), {
      metadata,
      occurredAt: this.#settings.now(),
      generateMessageId: this.#settings.generateMessageId,
    });
    await sql`release savepoint unit_of_work`.execute(transaction);
    return outcome;
  }

  #createRepositories(
    transaction: Transaction<Schema>,
    collector: OutgoingMessageCollector<RecordedEvent>,
  ): Repositories {
    return this.#settings.createRepositories({
      transaction,
      track: (aggregate) => {
        collector.trackedAggregates.push(aggregate);
      },
      enqueue: (message) => {
        collector.enqueuedMessages.push(message);
      },
    });
  }

  #outgoingMessages(collector: OutgoingMessageCollector<RecordedEvent>): readonly OutboxMessage[] {
    const recordedEvents = collector.trackedAggregates.flatMap((aggregate) =>
      aggregate.pullRecordedEvents(),
    );
    const eventMessages = recordedEvents.flatMap((event) => this.#settings.toOutboxMessages(event));
    return [...eventMessages, ...collector.enqueuedMessages];
  }
}
