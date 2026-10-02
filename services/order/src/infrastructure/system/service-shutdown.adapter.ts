export type Stopper = () => Promise<void>;

export async function stopInOrder(stoppers: readonly Stopper[]): Promise<void> {
  const failures: unknown[] = [];
  for (const stop of stoppers) {
    try {
      await stop();
    } catch (error) {
      failures.push(error);
    }
  }
  const [firstFailure] = failures;
  if (failures.length > 1) throw new AggregateError(failures, 'several parts failed to stop');
  if (failures.length === 1) throw firstFailure;
}
