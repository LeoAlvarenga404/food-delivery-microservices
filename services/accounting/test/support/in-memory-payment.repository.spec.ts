import { InMemoryPaymentRepository } from './in-memory-payment.repository.ts';
import { describePaymentRepositoryContract } from './payment-repository.contract.ts';

describePaymentRepositoryContract('in-memory', () => new InMemoryPaymentRepository());
