import { PermanentMessageFailure } from '@fd/chassis-kafka';
import {
  ApproveTicketSchema,
  CreateTicketSchema,
  RejectTicketSchema,
} from '@fd/contracts/fooddelivery/kitchen/v1/commands_pb.js';
import { describe, expect, it } from 'vitest';
import { buildCommandMessage } from '../../../../test/support/command-message.builder.ts';
import { createTicketInput, orderId } from '../../../../test/support/ticket.builder.ts';
import { toKitchenCommand } from './kitchen-command.message-mapper.ts';

const { restaurantId, lineItems } = createTicketInput();
const createTicket = { orderId, restaurantId, lineItems: [...lineItems] };
const sagaId = '0199a5d0-0000-7000-8000-0000000000b1';

describe('toKitchenCommand', () => {
  it('reads CreateTicket and chains its replies to the command message', () => {
    const message = buildCommandMessage(CreateTicketSchema, createTicket);

    expect(toKitchenCommand(message)).toEqual({
      type: 'CreateTicket',
      command: {
        orderId,
        restaurantId,
        lineItems,
        sagaId,
        metadata: {
          correlationId: '0199a5d0-0000-7000-8000-0000000000e1',
          causationId: message.headers.messageId,
          traceparent: undefined,
          actorId: undefined,
          actorType: undefined,
        },
      },
    });
  });

  it('reads ApproveTicket with the order id in canonical lowercase form', () => {
    const message = buildCommandMessage(ApproveTicketSchema, { orderId: orderId.toUpperCase() });

    expect(toKitchenCommand(message)).toMatchObject({
      type: 'ApproveTicket',
      command: { orderId, sagaId },
    });
  });

  it('reads RejectTicket with the order id in canonical lowercase form', () => {
    const message = buildCommandMessage(RejectTicketSchema, { orderId: orderId.toUpperCase() });

    expect(toKitchenCommand(message)).toEqual({
      type: 'RejectTicket',
      command: {
        orderId,
        sagaId,
        metadata: {
          correlationId: '0199a5d0-0000-7000-8000-0000000000e1',
          causationId: message.headers.messageId,
          traceparent: undefined,
          actorId: undefined,
          actorType: undefined,
        },
      },
    });
  });

  it('reads the restaurant and menu item ids in canonical lowercase form', () => {
    const message = buildCommandMessage(CreateTicketSchema, {
      ...createTicket,
      restaurantId: restaurantId.toUpperCase(),
      lineItems: lineItems.map((lineItem) => ({
        ...lineItem,
        menuItemId: lineItem.menuItemId.toUpperCase(),
      })),
    });

    expect(toKitchenCommand(message)).toMatchObject({
      command: { restaurantId, lineItems },
    });
  });

  it.each([
    {
      problem: 'a message type the kitchen does not handle',
      message: buildCommandMessage(
        ApproveTicketSchema,
        { orderId },
        {
          messageType: 'fooddelivery.kitchen.v1.AcceptTicket',
        },
      ),
    },
    {
      problem: 'a command without saga id',
      message: buildCommandMessage(ApproveTicketSchema, { orderId }, { sagaId: undefined }),
    },
    {
      problem: 'a payload that does not decode',
      message: {
        ...buildCommandMessage(CreateTicketSchema, createTicket),
        payload: new Uint8Array([0xff, 0xff, 0xff]),
      },
    },
    {
      problem: 'an order id that is not a uuid',
      message: buildCommandMessage(ApproveTicketSchema, { orderId: 'order-1' }),
    },
    {
      problem: 'a RejectTicket whose order id is not a uuid',
      message: buildCommandMessage(RejectTicketSchema, { orderId: '' }),
    },
    {
      problem: 'a restaurant id that is not a uuid',
      message: buildCommandMessage(CreateTicketSchema, { ...createTicket, restaurantId: '' }),
    },
    {
      problem: 'a menu item id that is not a uuid',
      message: buildCommandMessage(CreateTicketSchema, {
        ...createTicket,
        lineItems: lineItems.map((lineItem) => ({ ...lineItem, menuItemId: 'pizza' })),
      }),
    },
  ])('treats $problem as a permanent failure', ({ message }) => {
    expect(() => toKitchenCommand(message)).toThrow(PermanentMessageFailure);
  });
});
