import { describe, expect, it } from 'vitest';
import {
  placeOrderSagaDeadline,
  type PlaceOrderSagaTimeoutsInMilliseconds,
} from './place-order-saga-deadline.saga.ts';
import type { PlaceOrderSagaStep } from './place-order.saga-state.ts';

const enteredAt = new Date('2026-10-02T12:00:00.000Z');
const timeoutsInMilliseconds: PlaceOrderSagaTimeoutsInMilliseconds = {
  VERIFYING_CONSUMER: 1_000,
  CREATING_TICKET: 2_000,
  AUTHORIZING_PAYMENT: 3_000,
  APPROVING_TICKET: 4_000,
  REJECTING_TICKET: 5_000,
};

describe('placeOrderSagaDeadline', () => {
  it.each<[PlaceOrderSagaStep, string]>([
    ['VERIFYING_CONSUMER', '2026-10-02T12:00:01.000Z'],
    ['CREATING_TICKET', '2026-10-02T12:00:02.000Z'],
    ['AUTHORIZING_PAYMENT', '2026-10-02T12:00:03.000Z'],
    ['APPROVING_TICKET', '2026-10-02T12:00:04.000Z'],
    ['REJECTING_TICKET', '2026-10-02T12:00:05.000Z'],
  ])('gives %s its own timeout from the moment the saga entered it', (step, deadline) => {
    expect(placeOrderSagaDeadline(step, enteredAt, timeoutsInMilliseconds)).toEqual(
      new Date(deadline),
    );
  });

  it.each<PlaceOrderSagaStep>(['COMPLETED', 'COMPENSATED'])(
    'gives the finished step %s no deadline',
    (step) => {
      expect(placeOrderSagaDeadline(step, enteredAt, timeoutsInMilliseconds)).toBeUndefined();
    },
  );
});
