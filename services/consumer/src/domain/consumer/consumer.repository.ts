import type { ConsumerId } from './consumer-id.value-object.ts';
import type { Consumer } from './consumer.aggregate.ts';

export interface ConsumerRepository {
  findById(consumerId: ConsumerId): Promise<Consumer | undefined>;
  save(consumer: Consumer): Promise<void>;
}
