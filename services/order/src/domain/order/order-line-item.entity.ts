import { Entity } from '@fd/domain';
import type { MenuItemId } from '#domain/menu/menu-item-id.value-object.ts';
import type { MenuItem } from '#domain/menu/restaurant-menu.value-object.ts';
import { Money, type Currency } from '#domain/money/money.value-object.ts';

export interface OrderLineItemSnapshot {
  readonly menuItemId: MenuItemId;
  readonly name: string;
  readonly unitPriceInCents: bigint;
  readonly quantity: number;
}

export class OrderLineItem extends Entity<MenuItemId> {
  readonly #name: string;
  readonly #unitPrice: Money;
  readonly #quantity: number;

  private constructor(snapshot: OrderLineItemSnapshot, currency: Currency) {
    super(snapshot.menuItemId);
    this.#name = snapshot.name;
    this.#unitPrice = Money.of(snapshot.unitPriceInCents, currency);
    this.#quantity = snapshot.quantity;
  }

  static fromMenuItem(menuItem: MenuItem, quantity: number): OrderLineItem {
    const snapshot = {
      menuItemId: menuItem.menuItemId,
      name: menuItem.name,
      unitPriceInCents: menuItem.priceInCents,
      quantity,
    };
    return new OrderLineItem(snapshot, 'BRL');
  }

  static restore(snapshot: OrderLineItemSnapshot, currency: Currency): OrderLineItem {
    return new OrderLineItem(snapshot, currency);
  }

  total(): Money {
    return this.#unitPrice.multiply(this.#quantity);
  }

  toSnapshot(): OrderLineItemSnapshot {
    return {
      menuItemId: this.identity,
      name: this.#name,
      unitPriceInCents: this.#unitPrice.toSnapshot().amountInCents,
      quantity: this.#quantity,
    };
  }
}
