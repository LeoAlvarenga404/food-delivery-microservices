import { create } from '@bufbuild/protobuf';
import { timestampFromDate, type Timestamp } from '@bufbuild/protobuf/wkt';
import {
  TicketSchema,
  TicketStatus as ContractTicketStatus,
  type Ticket as TicketContract,
} from '@fd/contracts/fooddelivery/kitchen/v1/service_pb.js';
import type { TicketSnapshot } from '#domain/ticket/ticket.aggregate.ts';
import type { TicketState, TicketStatus } from '#domain/ticket/ticket.state.ts';

const contractStatuses = new Map<TicketStatus, ContractTicketStatus>([
  ['AWAITING_ACCEPTANCE', ContractTicketStatus.AWAITING_ACCEPTANCE],
  ['ACCEPTED', ContractTicketStatus.ACCEPTED],
  ['PREPARING', ContractTicketStatus.PREPARING],
  ['READY_FOR_PICKUP', ContractTicketStatus.READY_FOR_PICKUP],
]);

function toContractStatus(status: TicketStatus): ContractTicketStatus {
  const contractStatus = contractStatuses.get(status);
  if (contractStatus === undefined) {
    throw new Error(`a ${status} ticket is not shown to the kitchen`);
  }
  return contractStatus;
}

function readyByOf(state: TicketState): { readonly readyBy?: Timestamp } {
  return 'readyBy' in state ? { readyBy: timestampFromDate(state.readyBy) } : {};
}

export function toTicketContract(snapshot: TicketSnapshot): TicketContract {
  return create(TicketSchema, {
    ticketId: snapshot.ticketId,
    orderId: snapshot.orderId,
    restaurantId: snapshot.restaurantId,
    status: toContractStatus(snapshot.state.status),
    lineItems: snapshot.lineItems.map(({ menuItemId, name, quantity }) => ({
      menuItemId,
      name,
      quantity,
    })),
    ...readyByOf(snapshot.state),
  });
}
