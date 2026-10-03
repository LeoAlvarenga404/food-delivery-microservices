export class ConcurrencyConflictError extends Error {
  override readonly name = 'ConcurrencyConflictError';
  readonly code = '40001';
}
