import { create } from '@bufbuild/protobuf';
import { Code, ConnectError } from '@connectrpc/connect';
import { createLogger } from '@fd/chassis-observability';
import {
  ConsumerStatus,
  GetConsumerResponseSchema,
  RegisterConsumerFailureSchema,
} from '@fd/contracts/fooddelivery/consumer/v1/service_pb.js';
import type { LightMyRequestResponse } from 'fastify';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  FakeConsumerService,
  registeredConsumerId,
} from '../../test/support/consumer-service.fake.ts';
import { FakeOrderService } from '../../test/support/order-service.fake.ts';
import { fakeServiceAccess } from '../../test/support/service-access.fake.ts';
import { createConsumerBffServer, type ConsumerBffServer } from '../main.ts';

const callerCorrelationId = '0199a5d0-0000-7000-8000-0000000000e2';
const consumerAuthorization = { authorization: 'Bearer consumer-token' };
const homeAddress = {
  street: 'Rua Augusta',
  number: '1500',
  city: 'Sao Paulo',
  postalCode: '01304-001',
};
const registration = {
  name: 'Ana Souza',
  email: 'ana.souza@food-delivery.test',
  addresses: [homeAddress],
};

let consumerService: FakeConsumerService;
let server: ConsumerBffServer;

function register(
  headers: Record<string, string>,
  body: Record<string, unknown> = registration,
): Promise<LightMyRequestResponse> {
  return server.inject({ method: 'POST', url: '/v1/consumers/me', headers, payload: body });
}

function readOwnConsumer(headers: Record<string, string>): Promise<LightMyRequestResponse> {
  return server.inject({ method: 'GET', url: '/v1/consumers/me', headers });
}

beforeEach(async () => {
  consumerService = new FakeConsumerService();
  server = await createConsumerBffServer({
    orderService: new FakeOrderService().client(),
    consumerService: consumerService.client(),
    serviceAccess: fakeServiceAccess,
    logger: createLogger({ serviceName: 'consumer-bff', level: 'silent' }),
    generateCorrelationId: () => '0199a5d0-0000-7000-8000-0000000000e9',
  });
});

afterEach(() => server.close());

describe('POST /v1/consumers/me', () => {
  it('registers the caller with the consumer service token and answers with its location', async () => {
    const response = await register({
      ...consumerAuthorization,
      'x-correlation-id': callerCorrelationId,
    });

    expect(response.statusCode).toBe(201);
    expect(response.headers.location).toBe('/v1/consumers/me');
    expect(response.json()).toEqual({ consumerId: registeredConsumerId });
    expect(consumerService.receivedAuthorizations).toEqual(['Bearer consumer-service-token']);
    expect(consumerService.receivedCorrelationIds).toEqual([callerCorrelationId]);
    expect(consumerService.registerConsumerRequests).toMatchObject([registration]);
  });

  it.each([
    { scenario: 'without a token', headers: {}, status: 401 },
    {
      scenario: 'with the token of a caller who is not a consumer',
      headers: { authorization: 'Bearer staff-token' },
      status: 403,
    },
  ])(
    'answers a registration $scenario with a $status problem before validating it',
    async ({ headers, status }) => {
      const response = await register(headers, { name: 7 });

      expect(response.statusCode).toBe(status);
      expect(response.headers['content-type']).toBe('application/problem+json; charset=utf-8');
      expect(consumerService.receivedCorrelationIds).toHaveLength(0);
    },
  );

  it.each([
    { invalidPart: 'a missing email', body: { ...registration, email: undefined } },
    { invalidPart: 'addresses that are not a list', body: { ...registration, addresses: {} } },
    {
      invalidPart: 'an address without postal code',
      body: { ...registration, addresses: [{ ...homeAddress, postalCode: undefined }] },
    },
  ])(
    'answers $invalidPart with a bad request problem without calling the consumer service',
    async ({ body }) => {
      const response = await register(consumerAuthorization, body);

      expect(response.statusCode).toBe(400);
      expect(response.json()).toMatchObject({ title: 'Bad Request', status: 400 });
      expect(consumerService.receivedCorrelationIds).toHaveLength(0);
    },
  );

  it.each([
    {
      code: Code.AlreadyExists,
      reason: 'ConsumerAlreadyRegistered',
      status: 409,
      title: 'Conflict',
    },
    { code: Code.InvalidArgument, reason: 'InvalidEmail', status: 400, title: 'Bad Request' },
  ])(
    'answers a $reason refusal with a $status problem naming the reason',
    async ({ code, reason, status, title }) => {
      consumerService.failure = new ConnectError('refused', code, undefined, [
        { desc: RegisterConsumerFailureSchema, value: { reason } },
      ]);

      const response = await register(consumerAuthorization);

      expect(response.statusCode).toBe(status);
      expect(response.headers['content-type']).toBe('application/problem+json; charset=utf-8');
      expect(response.json()).toEqual({ type: 'about:blank', title, status, reason });
    },
  );
});

describe('GET /v1/consumers/me', () => {
  it.each([
    { status: ConsumerStatus.ACTIVE, publicStatus: 'ACTIVE' },
    { status: ConsumerStatus.BLOCKED, publicStatus: 'BLOCKED' },
  ])('answers the profile of a $publicStatus caller', async ({ status, publicStatus }) => {
    consumerService.profile = create(GetConsumerResponseSchema, {
      consumerId: registeredConsumerId,
      ...registration,
      status,
    });

    const response = await readOwnConsumer(consumerAuthorization);

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({
      consumerId: registeredConsumerId,
      ...registration,
      status: publicStatus,
    });
    expect(consumerService.receivedAuthorizations).toEqual(['Bearer consumer-service-token']);
  });

  it('answers a caller who has not registered with a not found problem', async () => {
    const response = await readOwnConsumer(consumerAuthorization);

    expect(response.statusCode).toBe(404);
    expect(response.json()).toEqual({ type: 'about:blank', title: 'Not Found', status: 404 });
  });

  it('answers a profile without a status as an internal error', async () => {
    consumerService.profile = create(GetConsumerResponseSchema, {
      consumerId: registeredConsumerId,
      ...registration,
    });

    const response = await readOwnConsumer(consumerAuthorization);

    expect(response.statusCode).toBe(500);
  });

  it('answers an anonymous caller with an unauthorized problem without calling the consumer service', async () => {
    const response = await readOwnConsumer({});

    expect(response.statusCode).toBe(401);
    expect(consumerService.receivedCorrelationIds).toHaveLength(0);
  });
});
