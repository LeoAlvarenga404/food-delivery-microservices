export type Json = JsonValue;

export type JsonArray = JsonValue[];

export type JsonObject = {
  [x: string]: JsonValue | undefined;
};

export type JsonPrimitive = boolean | number | string | null;

export type JsonValue = JsonArray | JsonObject | JsonPrimitive;

export interface Tickets {
  lineItems: Json;
  orderId: string;
  restaurantId: string;
  status: string;
  ticketId: string;
  version: number;
}

export interface DB {
  tickets: Tickets;
}
