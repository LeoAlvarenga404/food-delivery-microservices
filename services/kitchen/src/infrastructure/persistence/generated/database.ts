import type { ColumnType } from "kysely";

export type Json = JsonValue;

export type JsonArray = JsonValue[];

export type JsonObject = {
  [x: string]: JsonValue | undefined;
};

export type JsonPrimitive = boolean | number | string | null;

export type JsonValue = JsonArray | JsonObject | JsonPrimitive;

export type Timestamp = ColumnType<Date, Date | string, Date | string>;

export interface RestaurantMemberships {
  restaurantId: string;
  staffMemberIds: Json;
  version: number;
}

export interface Tickets {
  acceptedAt: Timestamp | null;
  consumerId: string;
  lineItems: Json;
  orderId: string;
  readyBy: Timestamp | null;
  restaurantId: string;
  status: string;
  ticketId: string;
  version: number;
}

export interface DB {
  restaurantMemberships: RestaurantMemberships;
  tickets: Tickets;
}
