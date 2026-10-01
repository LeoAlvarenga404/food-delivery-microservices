import { describe, expect, expectTypeOf, it } from 'vitest';
import { left, matchEither, right, type Either } from './either.ts';

interface OrderNotFound {
  readonly type: 'OrderNotFound';
  readonly orderId: string;
}

interface InvalidOrderTransition {
  readonly type: 'InvalidOrderTransition';
  readonly fromStatus: string;
}

interface SampleOrder {
  readonly orderId: string;
  readonly status: string;
}

function findOrder(orderId: string): Either<OrderNotFound, SampleOrder> {
  if (orderId === 'missing') return left({ type: 'OrderNotFound', orderId });
  return right({ orderId, status: 'APPROVAL_PENDING' });
}

function approveOrder(
  orderId: string,
): Either<OrderNotFound | InvalidOrderTransition, SampleOrder> {
  const orderResult = findOrder(orderId);
  if (orderResult.isLeft()) return orderResult;

  if (orderResult.success.status !== 'APPROVAL_PENDING') {
    return left({ type: 'InvalidOrderTransition', fromStatus: orderResult.success.status });
  }
  return right({ ...orderResult.success, status: 'APPROVED' });
}

describe('Either', () => {
  it('exposes the failure of a left', () => {
    const failure = left({ type: 'OrderNotFound', orderId: 'order-1' });

    expect(failure.isLeft()).toBe(true);
    expect(failure.isRight()).toBe(false);
    expect(failure.failure).toEqual({ type: 'OrderNotFound', orderId: 'order-1' });
  });

  it('exposes the success of a right', () => {
    const success = right(1500);

    expect(success.isRight()).toBe(true);
    expect(success.isLeft()).toBe(false);
    expect(success.success).toBe(1500);
  });

  it('propagates the same left instance through early return', () => {
    const outcome = approveOrder('missing');

    expect(outcome.isLeft()).toBe(true);
    expect(outcome).toEqual(left({ type: 'OrderNotFound', orderId: 'missing' }));
  });

  it('continues with the success after the early return', () => {
    const outcome = approveOrder('order-1');

    expect(outcome).toEqual(right({ orderId: 'order-1', status: 'APPROVED' }));
  });

  it('matches left and right to a single outcome', () => {
    const handlers = {
      onLeft: (failure: OrderNotFound) => `missing ${failure.orderId}`,
      onRight: (order: SampleOrder) => `found ${order.orderId}`,
    };

    expect(matchEither(findOrder('missing'), handlers)).toBe('missing missing');
    expect(matchEither(findOrder('order-1'), handlers)).toBe('found order-1');
  });

  it('hides success and failure until the either is narrowed', () => {
    const outcome = findOrder('order-1');

    expectTypeOf(outcome).not.toHaveProperty('success');
    expectTypeOf(outcome).not.toHaveProperty('failure');
    if (outcome.isRight()) expectTypeOf(outcome).toHaveProperty('success');
  });
});
