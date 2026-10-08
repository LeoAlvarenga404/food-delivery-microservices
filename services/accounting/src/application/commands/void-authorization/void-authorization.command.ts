import type { MessageMetadata } from '#application/ports/unit-of-work.port.ts';
import type { OrderId } from '#domain/payment/order-id.value-object.ts';

export interface VoidAuthorizationCommand {
  readonly orderId: OrderId;
  readonly sagaId: string;
  readonly metadata: MessageMetadata;
}
