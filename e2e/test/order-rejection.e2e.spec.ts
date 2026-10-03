import { randomUUID } from 'node:crypto';
import { beforeAll, describe, expect, it } from 'vitest';
import { DockerComposeStack } from './support/docker-compose-stack.adapter.ts';
import {
  HttpConsumerApi,
  pizzeriaOrder,
  walkingSkeletonConsumerId,
} from './support/http-consumer-api.adapter.ts';

const consumerApi = new HttpConsumerApi();
const stack = new DockerComposeStack();

beforeAll(() => consumerApi.waitUntilReachable());

describe('an order the saga cannot complete', () => {
  it('is rejected when the card is declined, after the kitchen rejected its ticket', async () => {
    const response = await consumerApi.placeOrder(
      { ...pizzeriaOrder, paymentToken: 'tok_visa_0002' },
      { 'idempotency-key': randomUUID(), 'x-consumer-id': walkingSkeletonConsumerId },
    );
    const orderId = await consumerApi.readPlacedOrderId(response);

    await expect(consumerApi.waitForOrderStatus(orderId, 'REJECTED')).resolves.toMatchObject({
      orderId,
      status: 'REJECTED',
      rejectionReason: 'PAYMENT_DECLINED',
    });
    expect(await stack.readTicketStatus(orderId)).toBe('REJECTED');
  });

  it('is rejected when the platform does not know the consumer', async () => {
    const response = await consumerApi.placeOrder(pizzeriaOrder, {
      'idempotency-key': randomUUID(),
      'x-consumer-id': randomUUID(),
    });
    const orderId = await consumerApi.readPlacedOrderId(response);

    await expect(consumerApi.waitForOrderStatus(orderId, 'REJECTED')).resolves.toMatchObject({
      orderId,
      status: 'REJECTED',
      rejectionReason: 'CONSUMER_NOT_FOUND',
    });
    expect(await stack.readTicketStatus(orderId)).toBe('');
  });
});
