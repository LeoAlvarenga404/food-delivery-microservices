import { sql, type QueryExecutorProvider } from 'kysely';

const inboxRetentionInMilliseconds = 2_592_000_000;

export async function deleteExpiredInboxEntries(
  executor: QueryExecutorProvider,
  now: Date,
): Promise<number> {
  const oldestKept = new Date(now.getTime() - inboxRetentionInMilliseconds);
  const result = await sql`delete from inbox where processed_at < ${oldestKept}`.execute(executor);
  return Number(result.numAffectedRows ?? 0n);
}
