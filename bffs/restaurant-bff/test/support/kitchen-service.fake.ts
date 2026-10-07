import { create } from '@bufbuild/protobuf';
import { timestampFromDate } from '@bufbuild/protobuf/wkt';
import {
  createClient,
  createRouterTransport,
  type Client,
  type ConnectError,
  type HandlerContext,
  type ServiceImpl,
} from '@connectrpc/connect';
import {
  KitchenService,
  TicketSchema,
  TicketStatus,
  type AcceptTicketRequest,
  type MarkTicketReadyRequest,
  type StartPreparingTicketRequest,
  type Ticket,
} from '@fd/contracts/fooddelivery/kitchen/v1/service_pb.js';

export const kitchenRestaurantId = '0199a5d0-0000-7000-8000-0000000000b1';
export const listedTicketId = '0199a5d0-0000-7000-8000-0000000000f1';

export const awaitingTicket: Ticket = create(TicketSchema, {
  ticketId: listedTicketId,
  orderId: '0199a5d0-0000-7000-8000-0000000000a1',
  restaurantId: kitchenRestaurantId,
  status: TicketStatus.AWAITING_ACCEPTANCE,
  lineItems: [
    { menuItemId: '0199a5d0-0000-7000-8000-000000000d01', name: 'Margherita', quantity: 2 },
  ],
});

export const acceptedTicket: Ticket = create(TicketSchema, {
  ...awaitingTicket,
  status: TicketStatus.ACCEPTED,
  readyBy: timestampFromDate(new Date('2026-10-06T18:15:00.000Z')),
});

export class FakeKitchenService {
  readonly acceptTicketRequests: AcceptTicketRequest[] = [];
  readonly startPreparingTicketRequests: StartPreparingTicketRequest[] = [];
  readonly markTicketReadyRequests: MarkTicketReadyRequest[] = [];
  readonly listedRestaurantIds: string[] = [];
  readonly receivedCorrelationIds: string[] = [];
  readonly receivedAuthorizations: (string | null)[] = [];
  tickets: readonly Ticket[] = [awaitingTicket];
  answeredTicket: Ticket = acceptedTicket;
  failure: ConnectError | undefined = undefined;

  implementation(): ServiceImpl<typeof KitchenService> {
    return {
      listTickets: (request, context) => {
        this.#receive(context);
        this.listedRestaurantIds.push(request.restaurantId);
        return { tickets: [...this.tickets] };
      },
      acceptTicket: (request, context) => {
        this.#receive(context);
        this.acceptTicketRequests.push(request);
        return { ticket: this.answeredTicket };
      },
      startPreparingTicket: (request, context) => {
        this.#receive(context);
        this.startPreparingTicketRequests.push(request);
        return { ticket: this.answeredTicket };
      },
      markTicketReady: (request, context) => {
        this.#receive(context);
        this.markTicketReadyRequests.push(request);
        return { ticket: this.answeredTicket };
      },
    };
  }

  client(): Client<typeof KitchenService> {
    return createClient(
      KitchenService,
      createRouterTransport(({ service }) => {
        service(KitchenService, this.implementation());
      }),
    );
  }

  #receive(context: HandlerContext): void {
    this.receivedCorrelationIds.push(context.requestHeader.get('x-correlation-id') ?? '');
    this.receivedAuthorizations.push(context.requestHeader.get('authorization'));
    if (this.failure !== undefined) throw this.failure;
  }
}
