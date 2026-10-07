import type { PlaceOrderCommand } from '#application/commands/place-order/place-order.command.ts';
import type { MessageMetadata } from '#application/ports/unit-of-work.port.ts';
import { orderInput, pizzeriaMenu } from './order.builder.ts';

export const requestMetadata: MessageMetadata = {
  correlationId: '0199a5d0-0000-7000-8000-0000000000e1',
  causationId: undefined,
  actorId: undefined,
  actorType: undefined,
};

export function buildPlaceOrderCommand(
  overrides: Partial<PlaceOrderCommand> = {},
): PlaceOrderCommand {
  const { consumerId, requestedLineItems, deliveryAddress } = orderInput();
  return {
    idempotencyKey: 'checkout-7f3a',
    requestHash: 'hash-of-the-first-request',
    principal: { consumerId },
    restaurantId: pizzeriaMenu.restaurantId,
    requestedLineItems,
    deliveryAddress,
    paymentToken: 'tok_visa_4242',
    metadata: requestMetadata,
    ...overrides,
  };
}
