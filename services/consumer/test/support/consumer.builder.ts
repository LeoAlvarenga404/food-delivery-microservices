import type { Either } from '@fd/domain';
import type { Address } from '#domain/consumer/address.value-object.ts';
import { parseConsumerId, type ConsumerId } from '#domain/consumer/consumer-id.value-object.ts';
import { parseConsumerName } from '#domain/consumer/consumer-name.value-object.ts';
import {
  Consumer,
  type ConsumerSnapshot,
  type RegisterConsumerInput,
} from '#domain/consumer/consumer.aggregate.ts';
import { parseEmail } from '#domain/consumer/email.value-object.ts';

export function unwrap<Success>(either: Either<unknown, Success>): Success {
  if (either.isLeft()) throw new Error(`expected a right, got ${JSON.stringify(either.failure)}`);
  return either.success;
}

export const activeConsumerId: ConsumerId = unwrap(
  parseConsumerId('0199a5d0-0000-7000-8000-0000000000c1'),
);

export const homeAddress: Address = {
  street: 'Rua Augusta',
  number: '1500',
  city: 'Sao Paulo',
  postalCode: '01304-001',
};

export const workAddress: Address = {
  street: 'Avenida Paulista',
  number: '1000',
  city: 'Sao Paulo',
  postalCode: '01310-100',
};

export function registrationInput(
  overrides: Partial<RegisterConsumerInput> = {},
): RegisterConsumerInput {
  return {
    consumerId: activeConsumerId,
    name: 'Ana Souza',
    email: 'ana.souza@food-delivery.test',
    addresses: [homeAddress],
    ...overrides,
  };
}

export function registerConsumer(overrides: Partial<RegisterConsumerInput> = {}): Consumer {
  return unwrap(Consumer.register(registrationInput(overrides)));
}

export function buildConsumer(overrides: Partial<ConsumerSnapshot> = {}): Consumer {
  return Consumer.restore({
    consumerId: activeConsumerId,
    name: unwrap(parseConsumerName('Ana Souza')),
    email: unwrap(parseEmail('ana.souza@food-delivery.test')),
    addresses: [homeAddress],
    status: 'ACTIVE',
    version: 1,
    ...overrides,
  });
}
