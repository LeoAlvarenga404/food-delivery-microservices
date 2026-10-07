import type { ColumnType } from "kysely";

export type Timestamp = ColumnType<Date, Date | string, Date | string>;

export interface Payments {
  amountInCents: bigint;
  authorizedAt: Timestamp;
  consumerId: string;
  currency: string;
  deliveryFeeInCents: bigint;
  gatewayAuthorizationId: string;
  orderId: string;
  paymentId: string;
  restaurantId: string;
  status: string;
  version: number;
}

export interface DB {
  payments: Payments;
}
