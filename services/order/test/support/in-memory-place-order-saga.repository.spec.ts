import { InMemoryPlaceOrderSagaRepository } from './in-memory-place-order-saga.repository.ts';
import { describePlaceOrderSagaRepositoryContract } from './place-order-saga-repository.contract.ts';

describePlaceOrderSagaRepositoryContract('in-memory', () => new InMemoryPlaceOrderSagaRepository());
