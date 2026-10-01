import { createDatabase, migrateToLatest, runInTransaction } from '@fd/chassis-postgres';
import { startPostgresContainer, type StartedPostgres } from '@fd/chassis-testing';
import { AggregateRoot, left, right, type DomainEvent } from '@fd/domain';
import { sql, type Kysely } from 'kysely';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { outboxMigrations } from './outbox-migrations.ts';
import type { MessageMetadata, OutboxMessage } from './outbox-message.ts';
import { UnitOfWork, type UnitOfWorkContext } from './unit-of-work.ts';

interface TabRenamed extends DomainEvent {
  readonly eventType: 'TabRenamed';
  readonly tabId: string;
  readonly title: string;
}

class Tab extends AggregateRoot<TabRenamed> {
  readonly tabId: string;
  title = '';

  constructor(tabId: string) {
    super();
    this.tabId = tabId;
  }

  rename(title: string): void {
    this.title = title;
    this.recordEvent({ eventType: 'TabRenamed', occurredAt: new Date(), tabId: this.tabId, title });
  }
}

interface TabsTable {
  readonly tabId: string;
  readonly title: string;
}

interface MarkersTable {
  readonly markerId: string;
}

interface OutboxRow {
  readonly id: string;
  readonly topic: string;
  readonly aggregateType: string;
  readonly aggregateId: string;
  readonly messageType: string;
  readonly payload: Buffer;
  readonly correlationId: string;
  readonly causationId: string | null;
  readonly sagaId: string | null;
  readonly traceparent: string | null;
  readonly actorId: string | null;
  readonly actorType: string | null;
  readonly occurredAt: Date;
}

interface TabSchema {
  readonly tabs: TabsTable;
  readonly markers: MarkersTable;
  readonly outbox: OutboxRow;
}

class TabRepository {
  readonly #context: UnitOfWorkContext<TabSchema, TabRenamed>;

  constructor(context: UnitOfWorkContext<TabSchema, TabRenamed>) {
    this.#context = context;
  }

  async save(tab: Tab): Promise<void> {
    await this.#context.transaction
      .insertInto('tabs')
      .values({ tabId: tab.tabId, title: tab.title })
      .execute();
    this.#context.track(tab);
  }

  enqueueReminder(tabId: string): void {
    this.#context.enqueue({
      topic: 'tab.commands',
      aggregateType: 'Tab',
      aggregateId: tabId,
      messageType: 'fooddelivery.tab.v1.RemindOwner',
      payload: new Uint8Array([0x0a, 0x00, 0xff]),
      sagaId: '0192a1b2-0000-7000-8000-0000000000a1',
    });
  }
}

const metadata: MessageMetadata = {
  correlationId: '0192a1b2-0000-7000-8000-0000000000c1',
  causationId: '0192a1b2-0000-7000-8000-0000000000c2',
  traceparent: undefined,
  actorId: 'consumer-1',
  actorType: 'consumer',
};

const occurredAt = new Date('2026-10-01T12:00:00.000Z');

function toOutboxMessages(event: TabRenamed): readonly OutboxMessage[] {
  return [
    {
      topic: 'tab.tab.events',
      aggregateType: 'Tab',
      aggregateId: event.tabId,
      messageType: 'fooddelivery.tab.v1.TabRenamed',
      payload: new TextEncoder().encode(event.title),
      sagaId: undefined,
    },
  ];
}

let postgres: StartedPostgres;
let database: Kysely<TabSchema>;
let messageSequence = 0;

function generateMessageId(): string {
  messageSequence += 1;
  return `0192a1b2-0000-7000-8000-${String(messageSequence).padStart(12, '0')}`;
}

const unitOfWork = (): UnitOfWork<TabSchema, TabRepository, TabRenamed> =>
  new UnitOfWork({
    database,
    createRepositories: (context) => new TabRepository(context),
    toOutboxMessages,
    generateMessageId,
    now: () => occurredAt,
  });

function renameTab(repository: TabRepository, title: string): Promise<void> {
  const tab = new Tab('tab-1');
  tab.rename(title);
  return repository.save(tab);
}

async function countRows(table: 'tabs' | 'outbox' | 'markers'): Promise<number> {
  const rows = await database.selectFrom(table).selectAll().execute();
  return rows.length;
}

beforeAll(async () => {
  postgres = await startPostgresContainer();
  database = createDatabase<TabSchema>({
    connectionString: postgres.connectionUri,
    maximumConnectionCount: 2,
    onConnectionError: () => undefined,
  });
  await migrateToLatest(database, [outboxMigrations]);
  await sql`create table tabs (tab_id text primary key, title text not null)`.execute(database);
  await sql`create table markers (marker_id text primary key)`.execute(database);
});

beforeEach(async () => {
  messageSequence = 0;
  await sql`truncate tabs, markers, outbox`.execute(database);
});

afterAll(async () => {
  await database.destroy();
  await postgres.stop();
});

describe('UnitOfWork.execute', () => {
  it('commits the aggregate with one outbox row per mapped event and per enqueued message', async () => {
    const outcome = await unitOfWork().execute(metadata, async (tabs) => {
      await renameTab(tabs, 'Friday dinner');
      tabs.enqueueReminder('tab-1');
      return right('renamed');
    });

    const outboxRows = await database.selectFrom('outbox').selectAll().orderBy('id').execute();

    expect(outcome).toEqual(right('renamed'));
    expect(await countRows('tabs')).toBe(1);
    expect(outboxRows).toEqual([
      {
        id: '0192a1b2-0000-7000-8000-000000000001',
        topic: 'tab.tab.events',
        aggregateType: 'Tab',
        aggregateId: 'tab-1',
        messageType: 'fooddelivery.tab.v1.TabRenamed',
        payload: Buffer.from('Friday dinner'),
        correlationId: metadata.correlationId,
        causationId: metadata.causationId,
        sagaId: null,
        traceparent: null,
        actorId: 'consumer-1',
        actorType: 'consumer',
        occurredAt,
      },
      expect.objectContaining({
        id: '0192a1b2-0000-7000-8000-000000000002',
        topic: 'tab.commands',
        payload: Buffer.from([0x0a, 0x00, 0xff]),
        sagaId: '0192a1b2-0000-7000-8000-0000000000a1',
      }),
    ]);
  });

  it('rolls everything back and returns the left when the work fails as expected', async () => {
    const outcome = await unitOfWork().execute(metadata, async (tabs) => {
      await renameTab(tabs, 'Friday dinner');
      tabs.enqueueReminder('tab-1');
      return left({ type: 'TabLocked' });
    });

    expect(outcome).toEqual(left({ type: 'TabLocked' }));
    expect(await countRows('tabs')).toBe(0);
    expect(await countRows('outbox')).toBe(0);
  });

  it('rolls everything back and rethrows when the work throws', async () => {
    const failing = unitOfWork().execute(metadata, async (tabs) => {
      await renameTab(tabs, 'Friday dinner');
      throw new Error('database went away');
    });

    await expect(failing).rejects.toThrow('database went away');
    expect(await countRows('tabs')).toBe(0);
    expect(await countRows('outbox')).toBe(0);
  });
});

describe('UnitOfWork.executeWithin', () => {
  it('discards only its own writes on a left and keeps the outer transaction usable', async () => {
    const outcome = await runInTransaction(database, async (transaction) => {
      await transaction.insertInto('markers').values({ markerId: 'marker-1' }).execute();
      return unitOfWork().executeWithin(transaction, metadata, async (tabs) => {
        await renameTab(tabs, 'Friday dinner');
        return left({ type: 'TabLocked' });
      });
    });

    expect(outcome.isLeft()).toBe(true);
    expect(await countRows('markers')).toBe(1);
    expect(await countRows('tabs')).toBe(0);
    expect(await countRows('outbox')).toBe(0);
  });

  it('writes the aggregate and its outbox rows inside the outer transaction on a right', async () => {
    const outboxRowsSeenFromOutside = await runInTransaction(database, async (transaction) => {
      await unitOfWork().executeWithin(transaction, metadata, async (tabs) => {
        await renameTab(tabs, 'Friday dinner');
        return right(undefined);
      });
      return countRows('outbox');
    });

    expect(outboxRowsSeenFromOutside).toBe(0);
    expect(await countRows('tabs')).toBe(1);
    expect(await countRows('outbox')).toBe(1);
  });
});
