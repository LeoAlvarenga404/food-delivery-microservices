import type { PlaceOrderSagaStep } from './place-order.saga-state.ts';

export type PlaceOrderSagaRunningStep = Exclude<PlaceOrderSagaStep, 'COMPLETED' | 'COMPENSATED'>;

export type PlaceOrderSagaTimeoutsInMilliseconds = Readonly<
  Record<PlaceOrderSagaRunningStep, number>
>;

export function placeOrderSagaDeadline(
  step: PlaceOrderSagaStep,
  enteredAt: Date,
  timeoutsInMilliseconds: PlaceOrderSagaTimeoutsInMilliseconds,
): Date | undefined {
  if (step === 'COMPLETED' || step === 'COMPENSATED') return undefined;
  return new Date(enteredAt.getTime() + timeoutsInMilliseconds[step]);
}
