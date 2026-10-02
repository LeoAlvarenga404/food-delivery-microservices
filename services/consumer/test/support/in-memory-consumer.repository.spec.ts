import { describeConsumerRepositoryContract } from './consumer-repository.contract.ts';
import { InMemoryConsumerRepository } from './in-memory-consumer.repository.ts';

describeConsumerRepositoryContract('in-memory', (storedConsumers) =>
  Promise.resolve(new InMemoryConsumerRepository(storedConsumers)),
);
