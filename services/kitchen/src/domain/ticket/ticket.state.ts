export type UnacceptedTicketStatus = 'CREATE_PENDING' | 'AWAITING_ACCEPTANCE' | 'REJECTED';

export type AcceptedTicketStatus = 'ACCEPTED' | 'PREPARING' | 'READY_FOR_PICKUP';

export type TicketState =
  | { readonly status: UnacceptedTicketStatus }
  | {
      readonly status: AcceptedTicketStatus;
      readonly acceptedAt: Date;
      readonly readyBy: Date;
    };

export type TicketStatus = TicketState['status'];
