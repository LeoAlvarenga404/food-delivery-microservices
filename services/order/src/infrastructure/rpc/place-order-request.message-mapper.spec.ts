import { create, fromBinary, toBinary } from '@bufbuild/protobuf';
import {
  PlaceOrderRequestSchema,
  type PlaceOrderRequest,
} from '@fd/contracts/fooddelivery/order/v1/service_pb.js';
import { describe, expect, it } from 'vitest';
import { hashPlaceOrderRequest } from './place-order-request.message-mapper.ts';

const unknownVarintField = Uint8Array.of(0x98, 0x06, 0x01);

function placeOrderRequest(): PlaceOrderRequest {
  return create(PlaceOrderRequestSchema, {
    idempotencyKey: 'checkout-7f3a',
    consumerId: '0199a5d0-0000-7000-8000-0000000000c1',
    restaurantId: '0199a5d0-0000-7000-8000-0000000000b1',
    lineItems: [{ menuItemId: '0199a5d0-0000-7000-8000-0000000000d1', quantity: 2 }],
    paymentToken: 'tok_visa_4242',
  });
}

describe('hashPlaceOrderRequest', () => {
  it('ignores the idempotency key', () => {
    const other = { ...placeOrderRequest(), idempotencyKey: 'checkout-other' };

    expect(hashPlaceOrderRequest(other)).toBe(hashPlaceOrderRequest(placeOrderRequest()));
  });

  it('hashes uppercase and lowercase twins of the same request alike', () => {
    const lowercase = placeOrderRequest();
    const uppercase = create(PlaceOrderRequestSchema, {
      ...lowercase,
      consumerId: lowercase.consumerId.toUpperCase(),
      restaurantId: lowercase.restaurantId.toUpperCase(),
      lineItems: lowercase.lineItems.map((lineItem) => ({
        ...lineItem,
        menuItemId: lineItem.menuItemId.toUpperCase(),
      })),
    });

    expect(hashPlaceOrderRequest(uppercase)).toBe(hashPlaceOrderRequest(lowercase));
  });

  it('hashes a request with an unknown field like the same request without it', () => {
    const known = toBinary(PlaceOrderRequestSchema, placeOrderRequest());
    const withUnknownField = fromBinary(
      PlaceOrderRequestSchema,
      Uint8Array.from([...known, ...unknownVarintField]),
    );

    expect(hashPlaceOrderRequest(withUnknownField)).toBe(
      hashPlaceOrderRequest(placeOrderRequest()),
    );
  });
});
