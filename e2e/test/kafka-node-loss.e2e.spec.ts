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
const kafkaNodes = ['kafka-1', 'kafka-2', 'kafka-3'];
const controllerElectionLimitInMilliseconds = 60_000;
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
  it('elects one of the two remaining nodes as the active controller', async () => {
    const remainingNode = kafkaNodes.find((kafkaNode) => kafkaNode !== stoppedKafkaNode);

    await expect
      .poll(() => stack.findActiveKafkaController(remainingNode), {
        timeout: controllerElectionLimitInMilliseconds,
        interval: 1_000,
      })
      .not.toBe(stoppedKafkaNode);
  });

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
