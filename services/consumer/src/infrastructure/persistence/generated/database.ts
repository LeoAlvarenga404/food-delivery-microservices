export interface Consumers {
  consumerId: string;
  status: string;
  version: number;
}

export interface DB {
  consumers: Consumers;
}
