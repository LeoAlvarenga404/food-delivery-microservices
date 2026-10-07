export type Json = JsonValue;

export type JsonArray = JsonValue[];

export type JsonObject = {
  [x: string]: JsonValue | undefined;
};

export type JsonPrimitive = boolean | number | string | null;

export type JsonValue = JsonArray | JsonObject | JsonPrimitive;

export interface Consumers {
  addresses: Json;
  consumerId: string;
  email: string;
  name: string;
  status: string;
  version: number;
}

export interface DB {
  consumers: Consumers;
}
