import type { MessageMetadata } from '#application/ports/unit-of-work.port.ts';
import type { Address } from '#domain/consumer/address.value-object.ts';
import type { ConsumerId } from '#domain/consumer/consumer-id.value-object.ts';
import type { ConsumerRegistrationError } from '#domain/consumer/consumer.aggregate.ts';
import type { Principal } from '#domain/identity/principal.value-object.ts';

export interface RegisterConsumerCommand {
  readonly principal: Principal;
  readonly name: string;
  readonly email: string;
  readonly addresses: readonly Address[];
  readonly metadata: MessageMetadata;
}

export interface ConsumerAlreadyRegistered {
  readonly type: 'ConsumerAlreadyRegistered';
  readonly consumerId: ConsumerId;
}

export type RegisterConsumerError = ConsumerRegistrationError | ConsumerAlreadyRegistered;

export interface RegisteredConsumer {
  readonly consumerId: ConsumerId;
}
