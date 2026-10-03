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
const accountingCommandsPartitionCount = 6;
const placementAttemptLimit = 60;
const murmurMultiplier = 0x5bd1e995;

function murmur2(key: string): number {
  const bytes = Buffer.from(key, 'utf8');
  const tailLength = bytes.length % 4;
  const wordsEnd = bytes.length - tailLength;
  let hash = 0x9747b28c ^ bytes.length;
  for (let offset = 0; offset < wordsEnd; offset += 4) {
    let word = Math.imul(bytes.readInt32LE(offset), murmurMultiplier);
    word = Math.imul(word ^ (word >>> 24), murmurMultiplier);
    hash = Math.imul(hash, murmurMultiplier) ^ word;
  }
  if (tailLength === 3) hash ^= bytes.readUInt8(wordsEnd + 2) << 16;
  if (tailLength >= 2) hash ^= bytes.readUInt8(wordsEnd + 1) << 8;
  if (tailLength >= 1) hash = Math.imul(hash ^ bytes.readUInt8(wordsEnd), murmurMultiplier);
  hash = Math.imul(hash ^ (hash >>> 13), murmurMultiplier);
  return hash ^ (hash >>> 15);
}

function accountingCommandsPartitionOf(orderId: string): number {
  return (murmur2(orderId) & 0x7fffffff) % accountingCommandsPartitionCount;
}

async function placeOrder(paymentToken: string): Promise<string> {
  const response = await consumerApi.placeOrder(
    { ...pizzeriaOrder, paymentToken },
    { 'idempotency-key': randomUUID(), 'x-consumer-id': walkingSkeletonConsumerId },
  );
  return consumerApi.readPlacedOrderId(response);
}

async function placeOrderOnPartition(partition: number): Promise<string> {
  for (let attempt = 1; attempt <= placementAttemptLimit; attempt += 1) {
    const orderId = await placeOrder('tok_visa_4242');
    if (accountingCommandsPartitionOf(orderId) === partition) return orderId;
  }
  throw new Error(`no order landed on accounting.commands partition ${String(partition)}`);
}

beforeAll(() => consumerApi.waitUntilReachable());

describe('an order whose payment step never answers', () => {
  it('is rejected through the payment deadline and leaves its accounting partition to the next order', async () => {
    const timedOutOrderId = await placeOrder('tok_visa_0005');

    await expect(
      consumerApi.waitForOrderStatus(timedOutOrderId, 'REJECTED'),
    ).resolves.toMatchObject({
      status: 'REJECTED',
      rejectionReason: 'PAYMENT_AUTHORIZATION_TIMED_OUT',
    });
    expect(await stack.readTicketStatus(timedOutOrderId)).toBe('REJECTED');
    const partition = accountingCommandsPartitionOf(timedOutOrderId);
    const nextOrderId = await placeOrderOnPartition(partition);
    await expect(consumerApi.waitForOrderStatus(nextOrderId, 'APPROVED')).resolves.toMatchObject({
      status: 'APPROVED',
    });
    const partitionsByKey = await stack.readPartitionsByKey('accounting.commands');
    expect([partitionsByKey.get(timedOutOrderId), partitionsByKey.get(nextOrderId)]).toEqual([
      partition,
      partition,
    ]);
  });
});
