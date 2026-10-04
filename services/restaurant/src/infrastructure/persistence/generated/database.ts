export type Json = JsonValue;

export type JsonArray = JsonValue[];

export type JsonObject = {
  [x: string]: JsonValue | undefined;
};

export type JsonPrimitive = boolean | number | string | null;

export type JsonValue = JsonArray | JsonObject | JsonPrimitive;

export interface MenuItems {
  isAvailable: boolean;
  menuItemId: string;
  name: string;
  position: number;
  priceInCents: bigint;
  restaurantId: string;
}

export interface RestaurantMembers {
  restaurantId: string;
  role: string;
  staffMemberId: string;
}

export interface Restaurants {
  category: string;
  city: string;
  latitude: number;
  longitude: number;
  minimumOrderInCents: bigint;
  name: string;
  number: string;
  openingHours: Json;
  postalCode: string;
  restaurantId: string;
  street: string;
  timeZone: string;
  version: number;
}

export interface DB {
  menuItems: MenuItems;
  restaurantMembers: RestaurantMembers;
  restaurants: Restaurants;
}
