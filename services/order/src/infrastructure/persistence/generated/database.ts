import type { ColumnType } from "kysely";

export type Json = JsonValue;

export type JsonArray = JsonValue[];

export type JsonObject = {
  [x: string]: JsonValue | undefined;
};

export type JsonPrimitive = boolean | number | string | null;

export type JsonValue = JsonArray | JsonObject | JsonPrimitive;

export type Timestamp = ColumnType<Date, Date | string, Date | string>;

export interface IdempotencyKeys {
  consumerId: string;
  createdAt: Timestamp;
  idempotencyKey: string;
  orderId: string;
  requestHash: string;
}

export interface OrderLineItems {
  lineNumber: number;
  menuItemId: string;
  name: string;
  orderId: string;
  quantity: number;
  unitPriceInCents: bigint;
}

export interface Orders {
  approvedAt: Timestamp | null;
  consumerId: string;
  currency: string;
  deliveryCity: string;
  deliveryNumber: string;
  deliveryPostalCode: string;
  deliveryStreet: string;
  orderId: string;
  placedAt: Timestamp;
  rejectedAt: Timestamp | null;
  rejectionReason: string | null;
  restaurantId: string;
  status: string;
  totalInCents: bigint;
  version: number;
}

export interface RestaurantMenus {
  menuItems: Json;
  minimumOrderInCents: bigint;
  openingHours: Json;
  restaurantId: string;
  timeZone: string;
  version: number;
}

export interface SagaInstances {
  deadlineAt: Timestamp | null;
  orderId: string;
  sagaId: string;
  sagaType: string;
  state: Json;
  status: string;
  step: string;
  version: number;
}

export interface DB {
  idempotencyKeys: IdempotencyKeys;
  orderLineItems: OrderLineItems;
  orders: Orders;
  restaurantMenus: RestaurantMenus;
  sagaInstances: SagaInstances;
}
