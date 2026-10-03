import { left, right } from '@fd/domain';
import { describe, expect, it } from 'vitest';
import {
  buildOrder,
  calabresaId,
  guaranaId,
  margheritaId,
  orderInput,
  pizzeriaMenu,
  unwrap,
} from '../../../test/support/order.builder.ts';
import { Order } from './order.aggregate.ts';

const placedAt = new Date('2026-10-02T12:00:00.000Z');
const approvedAt = new Date('2026-10-02T12:00:05.000Z');
const rejectedAt = new Date('2026-10-02T12:00:07.000Z');
const frozenLineItems = [
  { menuItemId: margheritaId, name: 'Margherita', unitPriceInCents: 4500n, quantity: 2 },
  { menuItemId: guaranaId, name: 'Guarana', unitPriceInCents: 800n, quantity: 1 },
];

describe('Order.place', () => {
  it('freezes the name and unit price of each menu item and computes the total', () => {
    const order = buildOrder();

    expect(order.toSnapshot()).toEqual({
      orderId: '0199a5d0-0000-7000-8000-0000000000a1',
      consumerId: '0199a5d0-0000-7000-8000-0000000000c1',
      restaurantId: pizzeriaMenu.restaurantId,
      lineItems: frozenLineItems,
      totalInCents: 9800n,
      currency: 'BRL',
      deliveryAddress: {
        street: 'Rua Augusta',
        number: '1500',
        city: 'Sao Paulo',
        postalCode: '01304-001',
      },
      placedAt,
      state: { status: 'APPROVAL_PENDING' },
      version: 0,
    });
  });

  it('records OrderPlaced with the frozen line items and the total', () => {
    expect(buildOrder().pullRecordedEvents()).toEqual([
      {
        eventType: 'OrderPlaced',
        occurredAt: placedAt,
        orderId: '0199a5d0-0000-7000-8000-0000000000a1',
        consumerId: '0199a5d0-0000-7000-8000-0000000000c1',
        restaurantId: pizzeriaMenu.restaurantId,
        lineItems: frozenLineItems,
        totalInCents: 9800n,
        currency: 'BRL',
      },
    ]);
  });

  it('rejects an order without line items', () => {
    expect(Order.place(orderInput({ requestedLineItems: [] }))).toEqual(
      left({ type: 'EmptyOrder' }),
    );
  });

  it.each([0, -1, 1.5])('rejects a quantity of %s', (quantity) => {
    const placement = Order.place(
      orderInput({ requestedLineItems: [{ menuItemId: calabresaId, quantity }] }),
    );

    expect(placement).toEqual(left({ type: 'InvalidQuantity', menuItemId: calabresaId, quantity }));
  });

  it('rejects a menu item that is not on the menu of the restaurant', () => {
    const menuWithoutMargherita = { ...pizzeriaMenu, items: pizzeriaMenu.items.slice(1) };

    const placement = Order.place(orderInput({ menu: menuWithoutMargherita }));

    expect(placement).toEqual(left({ type: 'UnknownMenuItem', menuItemId: margheritaId }));
  });

  it('rejects the same menu item on two lines', () => {
    const placement = Order.place(
      orderInput({
        requestedLineItems: [
          { menuItemId: guaranaId, quantity: 1 },
          { menuItemId: guaranaId, quantity: 2 },
        ],
      }),
    );

    expect(placement).toEqual(left({ type: 'DuplicateMenuItem', menuItemId: guaranaId }));
  });

  it.each(['street', 'number', 'city', 'postalCode'])(
    'rejects a delivery address with a blank %s',
    (field) => {
      const deliveryAddress = { ...orderInput().deliveryAddress, [field]: '  ' };

      expect(Order.place(orderInput({ deliveryAddress }))).toEqual(
        left({ type: 'IncompleteDeliveryAddress' }),
      );
    },
  );
});

describe('Order.approve', () => {
  it('approves a pending order and records OrderApproved', () => {
    const order = buildOrder();
    order.pullRecordedEvents();

    const approval = order.approve(approvedAt);

    expect(approval.isRight()).toBe(true);
    expect(order.toSnapshot().state).toEqual({ status: 'APPROVED', approvedAt });
    expect(order.pullRecordedEvents()).toEqual([
      {
        eventType: 'OrderApproved',
        occurredAt: approvedAt,
        orderId: '0199a5d0-0000-7000-8000-0000000000a1',
      },
    ]);
  });

  it('refuses to approve an order twice and records nothing the second time', () => {
    const order = buildOrder();
    unwrap(order.approve(approvedAt));
    order.pullRecordedEvents();

    expect(order.approve(new Date('2026-10-02T12:10:00.000Z'))).toEqual(
      left({ type: 'InvalidOrderTransition', from: 'APPROVED', to: 'APPROVED' }),
    );
    expect(order.toSnapshot().state).toEqual({ status: 'APPROVED', approvedAt });
    expect(order.pullRecordedEvents()).toEqual([]);
  });
});

describe('Order.reject', () => {
  it('rejects a pending order with its reason and records OrderRejected', () => {
    const order = buildOrder();
    order.pullRecordedEvents();

    expect(order.reject('PAYMENT_DECLINED', rejectedAt)).toEqual(right(undefined));
    expect(order.toSnapshot().state).toEqual({
      status: 'REJECTED',
      rejectionReason: 'PAYMENT_DECLINED',
      rejectedAt,
    });
    expect(order.pullRecordedEvents()).toEqual([
      {
        eventType: 'OrderRejected',
        occurredAt: rejectedAt,
        orderId: '0199a5d0-0000-7000-8000-0000000000a1',
        rejectionReason: 'PAYMENT_DECLINED',
      },
    ]);
  });

  it('refuses to reject an approved order and records nothing', () => {
    const order = buildOrder();
    unwrap(order.approve(approvedAt));
    order.pullRecordedEvents();

    expect(order.reject('PAYMENT_DECLINED', rejectedAt)).toEqual(
      left({ type: 'InvalidOrderTransition', from: 'APPROVED', to: 'REJECTED' }),
    );
    expect(order.toSnapshot().state).toEqual({ status: 'APPROVED', approvedAt });
    expect(order.pullRecordedEvents()).toEqual([]);
  });

  it('refuses to reject an order twice and keeps the first reason', () => {
    const order = buildOrder();
    unwrap(order.reject('CONSUMER_BLOCKED', rejectedAt));
    order.pullRecordedEvents();

    expect(order.reject('PAYMENT_DECLINED', new Date('2026-10-02T12:10:00.000Z'))).toEqual(
      left({ type: 'InvalidOrderTransition', from: 'REJECTED', to: 'REJECTED' }),
    );
    expect(order.toSnapshot().state).toEqual({
      status: 'REJECTED',
      rejectionReason: 'CONSUMER_BLOCKED',
      rejectedAt,
    });
    expect(order.pullRecordedEvents()).toEqual([]);
  });

  it('refuses to approve a rejected order', () => {
    const order = buildOrder();
    unwrap(order.reject('CONSUMER_NOT_FOUND', rejectedAt));

    expect(order.approve(approvedAt)).toEqual(
      left({ type: 'InvalidOrderTransition', from: 'REJECTED', to: 'APPROVED' }),
    );
    expect(order.toSnapshot().state.status).toBe('REJECTED');
  });
});

describe('Order.restore', () => {
  it('rehydrates an approved snapshot without recording events', () => {
    const order = buildOrder();
    unwrap(order.approve(approvedAt));
    const snapshot = { ...order.toSnapshot(), version: 3 };

    const restored = Order.restore(snapshot);

    expect(restored.toSnapshot()).toEqual(snapshot);
    expect(restored.pullRecordedEvents()).toEqual([]);
  });

  it('rehydrates a rejected snapshot that can no longer be approved', () => {
    const order = buildOrder();
    unwrap(order.reject('TICKET_REFUSED', rejectedAt));
    const snapshot = { ...order.toSnapshot(), version: 2 };

    const restored = Order.restore(snapshot);

    expect(restored.toSnapshot()).toEqual(snapshot);
    expect(restored.approve(approvedAt).isLeft()).toBe(true);
  });
});
