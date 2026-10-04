import { left, right } from '@fd/domain';
import { describe, expect, it } from 'vitest';
import {
  activeConsumerId,
  buildConsumer,
  homeAddress,
  registrationInput,
  workAddress,
} from '../../../test/support/consumer.builder.ts';
import { Consumer, type ConsumerSnapshot } from './consumer.aggregate.ts';

describe('Consumer', () => {
  it('registers an active consumer with a trimmed name, a canonical email and its addresses', () => {
    const registered = Consumer.register(
      registrationInput({
        name: ' Ana Souza ',
        email: 'Ana.Souza@Food-Delivery.test',
        addresses: [homeAddress, { ...workAddress, street: ' Avenida Paulista ' }],
      }),
    );

    expect(registered.isRight() && registered.success.toSnapshot()).toEqual({
      consumerId: activeConsumerId,
      name: 'Ana Souza',
      email: 'ana.souza@food-delivery.test',
      addresses: [homeAddress, workAddress],
      status: 'ACTIVE',
      version: 0,
    });
  });

  it('registers a consumer with five addresses', () => {
    const addresses = Array.from({ length: 5 }, () => homeAddress);

    expect(Consumer.register(registrationInput({ addresses })).isRight()).toBe(true);
  });

  it.each([
    { scenario: 'an empty name', input: { name: ' ' }, error: { type: 'InvalidConsumerName' } },
    { scenario: 'an invalid email', input: { email: 'ana' }, error: { type: 'InvalidEmail' } },
    {
      scenario: 'an address without city',
      input: { addresses: [homeAddress, { ...workAddress, city: '' }] },
      error: { type: 'InvalidAddress', field: 'city' },
    },
    {
      scenario: 'no address',
      input: { addresses: [] },
      error: { type: 'InvalidAddressCount', addressCount: 0 },
    },
    {
      scenario: 'six addresses',
      input: { addresses: Array.from({ length: 6 }, () => homeAddress) },
      error: { type: 'InvalidAddressCount', addressCount: 6 },
    },
  ])('refuses to register $scenario', ({ input, error }) => {
    expect(Consumer.register(registrationInput(input))).toEqual(left(error));
  });

  it('lets an active consumer order', () => {
    expect(buildConsumer().verifyMayOrder()).toEqual(right(undefined));
  });

  it('refuses a blocked consumer', () => {
    expect(buildConsumer({ status: 'BLOCKED' }).verifyMayOrder()).toEqual(
      left({ type: 'ConsumerBlocked', consumerId: activeConsumerId }),
    );
  });

  it('restores the snapshot it was given', () => {
    const snapshot: ConsumerSnapshot = {
      ...buildConsumer().toSnapshot(),
      addresses: [homeAddress, workAddress],
      status: 'BLOCKED',
      version: 3,
    };

    expect(buildConsumer(snapshot).toSnapshot()).toEqual(snapshot);
  });
});
