import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { DockerComposeStack } from './support/docker-compose-stack.adapter.ts';
import {
  HttpConsumerApi,
  pizzeriaOrder,
  walkingSkeletonConsumerId,
} from './support/http-consumer-api.adapter.ts';

const consumerApi = new HttpConsumerApi();
const stack = new DockerComposeStack();
const stoppedKafkaNode = 'kafka-1';

beforeAll(async () => {
  await consumerApi.waitUntilReachable();
  await stack.stopService(stoppedKafkaNode);
});

afterAll(() => stack.startService(stoppedKafkaNode));

describe('placing an order while one Kafka node is stopped', () => {
  it('still approves the order with the two remaining nodes', async () => {
    const response = await consumerApi.placeOrder(pizzeriaOrder, {
      'idempotency-key': randomUUID(),
      'x-consumer-id': walkingSkeletonConsumerId,
    });

    expect(response.status).toBe(201);
    const orderId = await consumerApi.readPlacedOrderId(response);
    await expect(
      consumerApi.waitForOrderStatus(orderId, 'APPROVED', 120_000),
    ).resolves.toMatchObject({ status: 'APPROVED' });
  });
});
