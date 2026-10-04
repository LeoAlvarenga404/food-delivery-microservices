import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { DockerComposeStack } from './support/docker-compose-stack.adapter.ts';
import {
  HttpConsumerApi,
  openPizzeria,
  type PizzeriaOrder,
} from './support/http-consumer-api.adapter.ts';

const consumerApi = new HttpConsumerApi('consumer-a');
const stack = new DockerComposeStack();
let stoppedKafkaNode = 'no node';
let pizzeriaOrder: PizzeriaOrder;

beforeAll(async () => {
  await consumerApi.waitUntilReachableAndRegistered();
  pizzeriaOrder = await openPizzeria();
  stoppedKafkaNode = await stack.findActiveKafkaController();
  await stack.stopService(stoppedKafkaNode);
});

afterAll(async () => {
  await stack.startService(stoppedKafkaNode);
  await stack.electPreferredLeaders();
});

describe('placing an order while the active Kafka controller is stopped', () => {
  it('still approves the order with the two remaining nodes', async () => {
    const response = await consumerApi.placeOrder(pizzeriaOrder, {
      'idempotency-key': randomUUID(),
    });

    expect(response.status).toBe(201);
    const orderId = await consumerApi.readPlacedOrderId(response);
    await expect(
      consumerApi.waitForOrderStatus(orderId, 'APPROVED', 120_000),
    ).resolves.toMatchObject({ status: 'APPROVED' });
  });
});
