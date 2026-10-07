import { Writable } from 'node:stream';
import { create, type MessageInitShape } from '@bufbuild/protobuf';
import {
  Code,
  ConnectError,
  createClient,
  createRouterTransport,
  type Client,
  type Interceptor,
} from '@connectrpc/connect';
import { createAccessTokenInterceptor, type AccessTokenVerifier } from '@fd/chassis-auth';
import { createLogger } from '@fd/chassis-observability';
import { ConcurrencyConflictError } from '@fd/chassis-postgres';
import { createRpcCorrelation } from '@fd/chassis-rpc';
import {
  ConsumerService,
  ConsumerStatus,
  RegisterConsumerFailureSchema,
  RegisterConsumerRequestSchema,
  type RegisterConsumerRequest,
} from '@fd/contracts/fooddelivery/consumer/v1/service_pb.js';
import { left, right } from '@fd/domain';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { activeConsumerId, homeAddress } from '../../../test/support/consumer.builder.ts';
import { InMemoryUnitOfWork } from '../../../test/support/in-memory-unit-of-work.adapter.ts';
import { RegisterConsumerCommandHandler } from '#application/commands/register-consumer/register-consumer.command-handler.ts';
import { GetConsumerQueryHandler } from '#application/queries/get-consumer/get-consumer.query-handler.ts';
import { createConsumerRpcService } from './consumer.rpc-service.ts';

const generatedCorrelationId = '0199a5d0-0000-7000-8000-0000000000e9';
const callerCorrelationId = '0199a5d0-0000-7000-8000-0000000000e2';
const consumerBId = '0199a5d0-0000-7000-8000-0000000000c2';
const sentPersonalDataPattern = /Ana Souza|ana\.souza@|Rua Augusta|01304-001/;
const verifiedAccessTokens = new Map([
  ['consumer-a-token', { subject: activeConsumerId, roles: ['consumer'] }],
  ['consumer-b-token', { subject: consumerBId, roles: ['consumer'] }],
  ['staff-token', { subject: '0199a5d0-0000-7000-8000-0000000000e1', roles: ['restaurant_staff'] }],
]);

type RegisterConsumerRequestInit = Exclude<
  MessageInitShape<typeof RegisterConsumerRequestSchema>,
  RegisterConsumerRequest
>;

let unitOfWork: InMemoryUnitOfWork;
let client: Client<typeof ConsumerService>;
let logEntries: Record<string, unknown>[];

const verify: AccessTokenVerifier = (accessToken) => {
  const verified = verifiedAccessTokens.get(accessToken);
  return Promise.resolve(
    verified === undefined
      ? left({ type: 'InvalidAccessToken', reason: 'ERR_JWS_INVALID' })
      : right(verified),
  );
};

function sendingAccessToken(accessToken: string): Interceptor {
  return (next) => (request) => {
    request.header.set('authorization', `Bearer ${accessToken}`);
    return next(request);
  };
}

function captureLogger(): ReturnType<typeof createLogger> {
  const destination = new Writable({
    write(chunk: Buffer, encoding, callback) {
      const parsed: unknown = JSON.parse(chunk.toString());
      logEntries.push(typeof parsed === 'object' && parsed !== null ? { ...parsed } : {});
      callback();
    },
  });
  return createLogger({ serviceName: 'consumer-service', level: 'info' }, destination);
}

function registerConsumerRequest(
  overrides: RegisterConsumerRequestInit = {},
): RegisterConsumerRequest {
  return create(RegisterConsumerRequestSchema, {
    name: 'Ana Souza',
    email: 'ana.souza@food-delivery.test',
    addresses: [homeAddress],
    ...overrides,
  });
}

function clientOf(
  accessToken: string,
  routerInterceptors: Interceptor[],
): Client<typeof ConsumerService> {
  const transport = createRouterTransport(
    ({ service }) => {
      service(
        ConsumerService,
        createConsumerRpcService({
          registerConsumer: new RegisterConsumerCommandHandler(unitOfWork),
          getConsumer: new GetConsumerQueryHandler(unitOfWork.consumers),
        }),
      );
    },
    {
      router: { interceptors: routerInterceptors },
      transport: { interceptors: [sendingAccessToken(accessToken)] },
    },
  );
  return createClient(ConsumerService, transport);
}

function clientFor(accessToken: string): Client<typeof ConsumerService> {
  const correlation = createRpcCorrelation({
    logger: captureLogger(),
    generateCorrelationId: () => generatedCorrelationId,
  });
  return clientOf(accessToken, [correlation, createAccessTokenInterceptor(verify)]);
}

async function rejectionOf(call: Promise<unknown>): Promise<ConnectError> {
  return ConnectError.from(
    await call.then(
      () => undefined,
      (rejection: unknown) => rejection,
    ),
  );
}

function reasonOf(error: ConnectError): string | undefined {
  return error.findDetails(RegisterConsumerFailureSchema).at(0)?.reason;
}

beforeEach(() => {
  unitOfWork = new InMemoryUnitOfWork();
  logEntries = [];
  client = clientFor('consumer-a-token');
});

describe('ConsumerService.RegisterConsumer', () => {
  it('registers the consumer of the access token, who becomes the actor', async () => {
    const response = await client.registerConsumer(registerConsumerRequest(), {
      headers: { 'x-correlation-id': callerCorrelationId },
    });

    expect(response.consumerId).toBe(activeConsumerId);
    expect(unitOfWork.executedMetadata).toEqual([
      {
        correlationId: callerCorrelationId,
        causationId: undefined,
        actorId: activeConsumerId,
        actorType: 'consumer',
      },
    ]);
    expect((await unitOfWork.consumers.findById(activeConsumerId))?.toSnapshot()).toMatchObject({
      name: 'Ana Souza',
      email: 'ana.souza@food-delivery.test',
      addresses: [homeAddress],
    });
  });

  it('refuses a second registration of the same caller as already existing, naming the reason', async () => {
    await client.registerConsumer(registerConsumerRequest());

    const error = await rejectionOf(client.registerConsumer(registerConsumerRequest()));

    expect(error.code).toBe(Code.AlreadyExists);
    expect(reasonOf(error)).toBe('ConsumerAlreadyRegistered');
  });

  it('answers a registration that loses a race with a concurrent one as already existing', async () => {
    vi.spyOn(unitOfWork, 'execute').mockRejectedValue(
      new ConcurrencyConflictError(`consumer ${activeConsumerId} already exists`),
    );

    const error = await rejectionOf(client.registerConsumer(registerConsumerRequest()));

    expect(error.code).toBe(Code.AlreadyExists);
    expect(reasonOf(error)).toBe('ConsumerAlreadyRegistered');
  });

  it.each([
    { invalidPart: 'an empty name', request: { name: ' ' }, reason: 'InvalidConsumerName' },
    { invalidPart: 'an invalid email', request: { email: 'ana' }, reason: 'InvalidEmail' },
    {
      invalidPart: 'an address without street',
      request: { addresses: [{ ...homeAddress, street: '' }] },
      reason: 'InvalidAddress',
    },
    { invalidPart: 'no address', request: { addresses: [] }, reason: 'InvalidAddressCount' },
    {
      invalidPart: 'an address with a control character',
      request: { addresses: [{ ...homeAddress, street: 'Rua\u0000Augusta' }] },
      reason: 'InvalidAddress',
    },
  ])(
    'refuses $invalidPart as an invalid argument naming the reason without echoing the request',
    async ({ request, reason }) => {
      const error = await rejectionOf(client.registerConsumer(registerConsumerRequest(request)));

      expect(error.code).toBe(Code.InvalidArgument);
      expect(reasonOf(error)).toBe(reason);
      expect(error.rawMessage).not.toMatch(sentPersonalDataPattern);
      expect(await unitOfWork.consumers.findById(activeConsumerId)).toBeUndefined();
    },
  );

  it('refuses a caller without the consumer role as permission denied before any work', async () => {
    const staffClient = clientFor('staff-token');

    await expect(staffClient.registerConsumer(registerConsumerRequest())).rejects.toMatchObject({
      code: Code.PermissionDenied,
    });
    await expect(staffClient.getConsumer({})).rejects.toMatchObject({
      code: Code.PermissionDenied,
    });
    expect(unitOfWork.executedMetadata).toEqual([]);
  });

  it('refuses a call whose access token was never verified as unauthenticated', async () => {
    const unverifiedClient = clientOf('consumer-a-token', []);

    await expect(
      unverifiedClient.registerConsumer(registerConsumerRequest()),
    ).rejects.toMatchObject({ code: Code.Unauthenticated });
    await expect(unverifiedClient.getConsumer({})).rejects.toMatchObject({
      code: Code.Unauthenticated,
    });
  });

  it('hides an unexpected failure from the client and logs it with the correlation id', async () => {
    vi.spyOn(unitOfWork, 'execute').mockRejectedValue(
      new Error('relation "consumers" does not exist'),
    );

    const error = await rejectionOf(client.registerConsumer(registerConsumerRequest()));

    expect(error).toMatchObject({ code: Code.Internal, rawMessage: 'internal error' });
    expect(error.metadata.get('x-correlation-id')).toBe(generatedCorrelationId);
    expect(logEntries).toMatchObject([
      {
        level: 50,
        correlationId: generatedCorrelationId,
        procedure: 'fooddelivery.consumer.v1.ConsumerService/RegisterConsumer',
        err: { message: 'relation "consumers" does not exist' },
      },
    ]);
  });
});

describe('ConsumerService.GetConsumer', () => {
  it('answers the profile of the registered caller', async () => {
    await client.registerConsumer(registerConsumerRequest());

    const response = await client.getConsumer({});

    expect(response).toMatchObject({
      consumerId: activeConsumerId,
      name: 'Ana Souza',
      email: 'ana.souza@food-delivery.test',
      addresses: [homeAddress],
      status: ConsumerStatus.ACTIVE,
    });
  });

  it('registers and answers every caller as the subject of its own access token', async () => {
    await client.registerConsumer(registerConsumerRequest());
    const consumerBClient = clientFor('consumer-b-token');

    const registered = await consumerBClient.registerConsumer(
      registerConsumerRequest({ name: 'Bruno Lima' }),
    );

    expect(registered.consumerId).toBe(consumerBId);
    expect(await consumerBClient.getConsumer({})).toMatchObject({
      consumerId: consumerBId,
      name: 'Bruno Lima',
    });
  });

  it('answers a caller who has not registered as not found', async () => {
    await expect(client.getConsumer({})).rejects.toMatchObject({ code: Code.NotFound });
  });
});
