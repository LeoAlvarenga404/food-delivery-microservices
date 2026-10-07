import type { ConsumerId } from '#domain/consumer/consumer-id.value-object.ts';
import type { Principal } from '#domain/identity/principal.value-object.ts';

export interface GetConsumerQuery {
  readonly principal: Principal;
}

export interface ConsumerNotRegistered {
  readonly type: 'ConsumerNotRegistered';
  readonly consumerId: ConsumerId;
}
