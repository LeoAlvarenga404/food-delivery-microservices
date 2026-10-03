const connectionLossMessageFragments = ['Connection terminated', 'is not queryable'];

export class DatabaseConnectionLostError extends Error {
  override readonly name = 'DatabaseConnectionLostError';
  readonly code = '08006';

  static fromDriverError(error: unknown): unknown {
    if (!(error instanceof Error) || 'code' in error) return error;
    const isConnectionLoss = connectionLossMessageFragments.some((fragment) =>
      error.message.includes(fragment),
    );
    return isConnectionLoss
      ? new DatabaseConnectionLostError(error.message, { cause: error })
      : error;
  }
}
