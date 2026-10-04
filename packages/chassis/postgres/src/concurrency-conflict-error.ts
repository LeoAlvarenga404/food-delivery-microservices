const uniqueViolationCode = '23505';

function isUniqueViolation(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    error.code === uniqueViolationCode
  );
}

export class ConcurrencyConflictError extends Error {
  override readonly name = 'ConcurrencyConflictError';
  readonly code = '40001';

  static fromUniqueViolation(error: unknown, message: string): unknown {
    return isUniqueViolation(error)
      ? new ConcurrencyConflictError(message, { cause: error })
      : error;
  }
}
