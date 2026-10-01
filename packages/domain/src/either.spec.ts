import { describe, expect, expectTypeOf, it } from 'vitest';
import { left, matchEither, right, type Either, type Left, type Right } from './either.ts';

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
    const notFound = left({ type: 'OrderNotFound', orderId: 'order-1' });

    expect(notFound.isLeft()).toBe(true);
    expect(notFound.isRight()).toBe(false);
    expect(notFound.failure).toEqual({ type: 'OrderNotFound', orderId: 'order-1' });
  });

  it('exposes the success of a right', () => {
    const amount = right(1500);

    expect(amount.isRight()).toBe(true);
    expect(amount.isLeft()).toBe(false);
    expect(amount.success).toBe(1500);
  });

  it('propagates the left through early return', () => {
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

  it('narrows each guard to exactly one side', () => {
    const outcome = findOrder('order-1');

    if (outcome.isLeft()) expectTypeOf(outcome).toEqualTypeOf<Left<OrderNotFound>>();
    if (outcome.isRight()) expectTypeOf(outcome).toEqualTypeOf<Right<SampleOrder>>();
  });
});
