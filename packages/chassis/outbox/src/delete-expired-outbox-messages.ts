import { sql, type QueryExecutorProvider } from 'kysely';

const outboxRetentionInMilliseconds = 86_400_000;

export async function deleteExpiredOutboxMessages(
  executor: QueryExecutorProvider,
  now: Date,
): Promise<number> {
  const oldestKept = new Date(now.getTime() - outboxRetentionInMilliseconds);
  const result = await sql`delete from outbox where occurred_at < ${oldestKept}`.execute(executor);
  return Number(result.numAffectedRows ?? 0n);
}
