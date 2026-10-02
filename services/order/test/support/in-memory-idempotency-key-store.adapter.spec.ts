import { describeIdempotencyKeyStoreContract } from './idempotency-key-store.contract.ts';
import { InMemoryIdempotencyKeyStore } from './in-memory-idempotency-key-store.adapter.ts';

describeIdempotencyKeyStoreContract('in-memory', () => new InMemoryIdempotencyKeyStore());
