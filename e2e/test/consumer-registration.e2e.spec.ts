import { randomUUID } from 'node:crypto';
import { beforeAll, describe, expect, it } from 'vitest';
import {
  consumerRegistration,
  HttpConsumerApi,
  pizzeriaOrder,
  type OrderView,
} from './support/http-consumer-api.adapter.ts';
import { KeycloakUserAdministration } from './support/keycloak-user-administration.adapter.ts';

const administration = new KeycloakUserAdministration();

async function newConsumerApi(): Promise<HttpConsumerApi> {
  return new HttpConsumerApi((await administration.createConsumer()).username);
}

async function placeOrderAndWaitFor(
  consumerApi: HttpConsumerApi,
  status: string,
): Promise<OrderView> {
  const response = await consumerApi.placeOrder(pizzeriaOrder, {
    'idempotency-key': randomUUID(),
  });
  return consumerApi.waitForOrderStatus(await consumerApi.readPlacedOrderId(response), status);
}

beforeAll(() => new HttpConsumerApi(undefined).waitUntilReachable());

describe('registering as a consumer through the edge', () => {
  it('rejects the order of a new consumer until it registers, then approves it', async () => {
    const { username, subject } = await administration.createConsumer();
    const consumerApi = new HttpConsumerApi(username);
    expect((await consumerApi.fetchOwnConsumer()).status).toBe(404);
    await expect(placeOrderAndWaitFor(consumerApi, 'REJECTED')).resolves.toMatchObject({
      rejectionReason: 'CONSUMER_NOT_FOUND',
    });

    const registered = await consumerApi.registerConsumer({
      ...consumerRegistration,
      email: 'Ana.Souza@Food-Delivery.test',
    });

    expect(registered.status).toBe(201);
    expect(registered.headers.get('location')).toBe('/v1/consumers/me');
    expect(await registered.json()).toEqual({ consumerId: subject });
    const profile = await consumerApi.fetchOwnConsumer();
    expect(await profile.json()).toEqual({
      consumerId: subject,
      ...consumerRegistration,
      email: 'ana.souza@food-delivery.test',
      status: 'ACTIVE',
    });
    await expect(placeOrderAndWaitFor(consumerApi, 'APPROVED')).resolves.toMatchObject({
      status: 'APPROVED',
    });
  });

  it('refuses a second registration of the same consumer with a conflict problem', async () => {
    const consumerApi = await newConsumerApi();
    await consumerApi.registerConsumer(consumerRegistration);

    const repeated = await consumerApi.registerConsumer(consumerRegistration);

    expect(repeated.status).toBe(409);
    expect(repeated.headers.get('content-type')).toBe('application/problem+json; charset=utf-8');
    expect(await repeated.json()).toEqual({
      type: 'about:blank',
      title: 'Conflict',
      status: 409,
      reason: 'ConsumerAlreadyRegistered',
    });
  });

  it('refuses an invalid registration with a bad request problem naming the reason', async () => {
    const consumerApi = await newConsumerApi();

    const refused = await consumerApi.registerConsumer({ ...consumerRegistration, addresses: [] });

    expect(refused.status).toBe(400);
    expect(await refused.json()).toMatchObject({ status: 400, reason: 'InvalidAddressCount' });
    expect((await consumerApi.fetchOwnConsumer()).status).toBe(404);
  });
});
