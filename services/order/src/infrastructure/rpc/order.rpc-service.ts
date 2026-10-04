import { Code, ConnectError, type HandlerContext, type ServiceImpl } from '@connectrpc/connect';
import { annotateActiveSpan } from '@fd/chassis-observability';
import { correlationIdKey, principalOf } from '@fd/chassis-rpc';
import {
  PlaceOrderFailureSchema,
  type OrderService,
  type PlaceOrderRequest,
} from '@fd/contracts/fooddelivery/order/v1/service_pb.js';
import type {
  PlaceOrderCommand,
  PlaceOrderError,
} from '#application/commands/place-order/place-order.command.ts';
import type { PlaceOrderCommandHandler } from '#application/commands/place-order/place-order.command-handler.ts';
import type { MessageMetadata } from '#application/ports/unit-of-work.port.ts';
import type { GetOrderQueryHandler } from '#application/queries/get-order/get-order.query-handler.ts';
import { parsePrincipal, type Principal } from '#domain/identity/principal.value-object.ts';
import { parseOrderId } from '#domain/order/order-id.value-object.ts';
import { toGetOrderResponse } from './get-order-response.message-mapper.ts';
import {
  toPlaceOrderCommand,
  type InvalidPlaceOrderRequest,
} from './place-order-request.message-mapper.ts';

export interface OrderRpcServiceSettings {
  readonly placeOrder: PlaceOrderCommandHandler;
  readonly getOrder: GetOrderQueryHandler;
}

function toConnectCode(error: PlaceOrderError): Code {
  switch (error.type) {
    case 'EmptyOrder':
    case 'InvalidQuantity':
    case 'DuplicateMenuItem':
    case 'IncompleteDeliveryAddress':
      return Code.InvalidArgument;
    case 'UnknownRestaurant':
    case 'UnknownMenuItem':
    case 'IdempotencyKeyReused':
      return Code.FailedPrecondition;
  }
}

type PlaceOrderFailureReason = PlaceOrderError['type'] | InvalidPlaceOrderRequest['type'];

function placeOrderFailure(
  message: string,
  code: Code,
  reason: PlaceOrderFailureReason,
): ConnectError {
  return new ConnectError(message, code, undefined, [
    { desc: PlaceOrderFailureSchema, value: { reason } },
  ]);
}

function toRequestMetadata(context: HandlerContext, principal: Principal): MessageMetadata {
  return {
    correlationId: context.values.get(correlationIdKey),
    causationId: undefined,
    actorId: principal.consumerId,
    actorType: 'consumer',
  };
}

function toCommand(request: PlaceOrderRequest, context: HandlerContext): PlaceOrderCommand {
  const principal = principalOf(context, parsePrincipal);
  const command = toPlaceOrderCommand(request, principal, toRequestMetadata(context, principal));
  if (command.isLeft()) {
    const { field, type } = command.failure;
    throw placeOrderFailure(field, Code.InvalidArgument, type);
  }
  return command.success;
}

export function createOrderRpcService(
  settings: OrderRpcServiceSettings,
): ServiceImpl<typeof OrderService> {
  return {
    async placeOrder(request, context) {
      const outcome = await settings.placeOrder.execute(toCommand(request, context));
      if (outcome.isLeft()) {
        const { failure } = outcome;
        throw placeOrderFailure(JSON.stringify(failure), toConnectCode(failure), failure.type);
      }
      annotateActiveSpan({ orderId: outcome.success.orderId });
      return { orderId: outcome.success.orderId };
    },

    async getOrder(request, context) {
      const principal = principalOf(context, parsePrincipal);
      const orderId = parseOrderId(request.orderId);
      if (orderId.isLeft()) throw new ConnectError('order_id', Code.InvalidArgument);
      annotateActiveSpan({ orderId: orderId.success });
      const outcome = await settings.getOrder.execute({ orderId: orderId.success, principal });
      if (outcome.isLeft()) throw new ConnectError(request.orderId, Code.NotFound);
      return toGetOrderResponse(outcome.success);
    },
  };
}
