import { Code, ConnectError, type HandlerContext, type ServiceImpl } from '@connectrpc/connect';
import { isUuid } from '@fd/domain';
import type { OrderService } from '@fd/contracts/fooddelivery/order/v1/service_pb.js';
import type { PlaceOrderError } from '#application/commands/place-order/place-order.command.ts';
import type { PlaceOrderCommandHandler } from '#application/commands/place-order/place-order.command-handler.ts';
import type { MessageMetadata } from '#application/ports/unit-of-work.port.ts';
import type { GetOrderQueryHandler } from '#application/queries/get-order/get-order.query-handler.ts';
import { parseOrderId } from '#domain/order/order-id.value-object.ts';
import { toGetOrderResponse } from './get-order-response.message-mapper.ts';
import { toPlaceOrderCommand } from './place-order-request.message-mapper.ts';

export interface OrderRpcServiceSettings {
  readonly placeOrder: PlaceOrderCommandHandler;
  readonly getOrder: GetOrderQueryHandler;
  readonly generateCorrelationId: () => string;
}

const correlationIdHeader = 'x-correlation-id';

function toConnectCode(error: PlaceOrderError): Code {
  switch (error.type) {
    case 'EmptyOrder':
    case 'InvalidQuantity':
    case 'DuplicateMenuItem':
    case 'IncompleteDeliveryAddress':
      return Code.InvalidArgument;
    case 'UnknownRestaurant':
    case 'UnknownMenuItem':
      return Code.FailedPrecondition;
    case 'IdempotencyKeyReused':
      return Code.AlreadyExists;
  }
}

function toRequestMetadata(
  context: HandlerContext,
  generateCorrelationId: () => string,
): MessageMetadata {
  const incomingCorrelationId = context.requestHeader.get(correlationIdHeader);
  const hasUsableCorrelationId = incomingCorrelationId !== null && isUuid(incomingCorrelationId);
  return {
    correlationId: hasUsableCorrelationId ? incomingCorrelationId : generateCorrelationId(),
    causationId: undefined,
    traceparent: undefined,
    actorId: undefined,
    actorType: undefined,
  };
}

export function createOrderRpcService(
  settings: OrderRpcServiceSettings,
): ServiceImpl<typeof OrderService> {
  return {
    async placeOrder(request, context) {
      const metadata = toRequestMetadata(context, settings.generateCorrelationId);
      const command = toPlaceOrderCommand(request, metadata);
      if (command.isLeft()) throw new ConnectError(command.failure.field, Code.InvalidArgument);
      const outcome = await settings.placeOrder.execute(command.success);
      if (outcome.isLeft()) {
        throw new ConnectError(JSON.stringify(outcome.failure), toConnectCode(outcome.failure));
      }
      return { orderId: outcome.success.orderId };
    },

    async getOrder(request) {
      const orderId = parseOrderId(request.orderId);
      if (orderId.isLeft()) throw new ConnectError('order_id', Code.InvalidArgument);
      const outcome = await settings.getOrder.execute({ orderId: orderId.success });
      if (outcome.isLeft()) throw new ConnectError(request.orderId, Code.NotFound);
      return toGetOrderResponse(outcome.success);
    },
  };
}
