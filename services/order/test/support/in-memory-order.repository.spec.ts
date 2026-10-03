import { InMemoryOrderRepository } from './in-memory-order.repository.ts';
import { describeOrderRepositoryContract } from './order-repository.contract.ts';

describeOrderRepositoryContract('in-memory', () => new InMemoryOrderRepository());
