import { Code, ConnectError, type HandlerContext, type ServiceImpl } from '@connectrpc/connect';
import { ConcurrencyConflictError } from '@fd/chassis-postgres';
import {
  RegisterConsumerFailureSchema,
  type ConsumerService,
  type RegisterConsumerRequest,
} from '@fd/contracts/fooddelivery/consumer/v1/service_pb.js';
import { left, type Either } from '@fd/domain';
import type {
  RegisterConsumerCommand,
  RegisterConsumerError,
  RegisteredConsumer,
} from '#application/commands/register-consumer/register-consumer.command.ts';
import type { RegisterConsumerCommandHandler } from '#application/commands/register-consumer/register-consumer.command-handler.ts';
import type { GetConsumerQueryHandler } from '#application/queries/get-consumer/get-consumer.query-handler.ts';
import { toGetConsumerResponse } from './get-consumer-response.message-mapper.ts';
import { correlationIdKey } from './rpc-correlation.adapter.ts';
import { principalOf } from './rpc-principal.adapter.ts';

export interface ConsumerRpcServiceSettings {
  readonly registerConsumer: RegisterConsumerCommandHandler;
  readonly getConsumer: GetConsumerQueryHandler;
}

function toConnectCode(error: RegisterConsumerError): Code {
  switch (error.type) {
    case 'InvalidConsumerName':
    case 'InvalidEmail':
    case 'InvalidAddress':
    case 'InvalidAddressCount':
      return Code.InvalidArgument;
    case 'ConsumerAlreadyRegistered':
      return Code.AlreadyExists;
  }
}

function registerConsumerFailure(error: RegisterConsumerError): ConnectError {
  return new ConnectError(JSON.stringify(error), toConnectCode(error), undefined, [
    { desc: RegisterConsumerFailureSchema, value: { reason: error.type } },
  ]);
}

function toCommand(
  request: RegisterConsumerRequest,
  context: HandlerContext,
): RegisterConsumerCommand {
  const principal = principalOf(context);
  return {
    principal,
    name: request.name,
    email: request.email,
    addresses: request.addresses.map(({ street, number, city, postalCode }) => ({
      street,
      number,
      city,
      postalCode,
    })),
    metadata: {
      correlationId: context.values.get(correlationIdKey),
      causationId: undefined,
      actorId: principal.consumerId,
      actorType: 'consumer',
    },
  };
}

async function register(
  handler: RegisterConsumerCommandHandler,
  command: RegisterConsumerCommand,
): Promise<Either<RegisterConsumerError, RegisteredConsumer>> {
  try {
    return await handler.execute(command);
  } catch (error) {
    if (!(error instanceof ConcurrencyConflictError)) throw error;
    return left({ type: 'ConsumerAlreadyRegistered', consumerId: command.principal.consumerId });
  }
}

export function createConsumerRpcService(
  settings: ConsumerRpcServiceSettings,
): ServiceImpl<typeof ConsumerService> {
  return {
    async registerConsumer(request, context) {
      const outcome = await register(settings.registerConsumer, toCommand(request, context));
      if (outcome.isLeft()) throw registerConsumerFailure(outcome.failure);
      return { consumerId: outcome.success.consumerId };
    },

    async getConsumer(request, context) {
      const outcome = await settings.getConsumer.execute({ principal: principalOf(context) });
      if (outcome.isLeft()) throw new ConnectError(outcome.failure.type, Code.NotFound);
      return toGetConsumerResponse(outcome.success);
    },
  };
}
