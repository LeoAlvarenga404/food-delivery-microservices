import { left, right } from '@fd/domain';
import { describe, expect, it } from 'vitest';
import {
  activeConsumerId,
  homeAddress,
  registerConsumer,
} from '../../../../test/support/consumer.builder.ts';
import { InMemoryUnitOfWork } from '../../../../test/support/in-memory-unit-of-work.adapter.ts';
import type { RegisterConsumerCommand } from './register-consumer.command.ts';
import { RegisterConsumerCommandHandler } from './register-consumer.command-handler.ts';

const command: RegisterConsumerCommand = {
  principal: { consumerId: activeConsumerId },
  name: 'Bruno Lima',
  email: 'bruno.lima@food-delivery.test',
  addresses: [homeAddress],
  metadata: {
    correlationId: '0199a5d0-0000-7000-8000-0000000000e1',
    causationId: undefined,
    actorId: activeConsumerId,
    actorType: 'consumer',
  },
};

describe('RegisterConsumerCommandHandler', () => {
  it('registers the principal as an active consumer', async () => {
    const unitOfWork = new InMemoryUnitOfWork();

    const outcome = await new RegisterConsumerCommandHandler(unitOfWork).execute(command);

    expect(outcome).toEqual(right({ consumerId: activeConsumerId }));
    expect((await unitOfWork.consumers.findById(activeConsumerId))?.toSnapshot()).toEqual({
      consumerId: activeConsumerId,
      name: 'Bruno Lima',
      email: 'bruno.lima@food-delivery.test',
      addresses: [homeAddress],
      status: 'ACTIVE',
      version: 1,
    });
    expect(unitOfWork.executedMetadata).toEqual([command.metadata]);
  });

  it('refuses a principal who already registered and keeps the first registration', async () => {
    const firstRegistration = registerConsumer();
    const unitOfWork = new InMemoryUnitOfWork();
    await unitOfWork.consumers.save(firstRegistration);

    const outcome = await new RegisterConsumerCommandHandler(unitOfWork).execute(command);

    expect(outcome).toEqual(
      left({ type: 'ConsumerAlreadyRegistered', consumerId: activeConsumerId }),
    );
    expect((await unitOfWork.consumers.findById(activeConsumerId))?.toSnapshot()).toEqual({
      ...firstRegistration.toSnapshot(),
      version: 1,
    });
  });

  it('refuses an invalid registration without storing a consumer', async () => {
    const unitOfWork = new InMemoryUnitOfWork();

    const outcome = await new RegisterConsumerCommandHandler(unitOfWork).execute({
      ...command,
      email: 'bruno',
    });

    expect(outcome).toEqual(left({ type: 'InvalidEmail' }));
    expect(await unitOfWork.consumers.findById(activeConsumerId)).toBeUndefined();
  });
});
