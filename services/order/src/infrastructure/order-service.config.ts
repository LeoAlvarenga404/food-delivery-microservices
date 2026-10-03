import { environmentVariables, parseEnvironment } from '@fd/chassis-config';
import type { LogLevel } from '@fd/chassis-observability';
import { z } from 'zod';
import type { PlaceOrderSagaTimeoutsInMilliseconds } from '#application/sagas/place-order/place-order-saga-deadline.saga.ts';

export interface OrderServiceConfiguration {
  readonly databaseUrl: string;
  readonly kafkaBootstrapServers: readonly string[];
  readonly host: string;
  readonly port: number;
  readonly logLevel: LogLevel;
  readonly sagaTimeoutsInMilliseconds: PlaceOrderSagaTimeoutsInMilliseconds;
}

const timeoutInMilliseconds = z
  .string()
  .trim()
  .min(1)
  .transform(Number)
  .pipe(z.number().int().min(1).max(2_147_483_647));

const orderServiceEnvironmentSchema = z.object({
  ORDER_DATABASE_URL: environmentVariables.postgresUrl,
  KAFKA_BOOTSTRAP_SERVERS: environmentVariables.kafkaBootstrapServers,
  ORDER_SERVICE_HOST: environmentVariables.listenHost,
  ORDER_SERVICE_PORT: environmentVariables.listenPort.default(4001),
  LOG_LEVEL: environmentVariables.logLevel,
  PLACE_ORDER_SAGA_STEP_TIMEOUT_IN_MILLISECONDS: timeoutInMilliseconds.default(30_000),
  PLACE_ORDER_SAGA_PAYMENT_TIMEOUT_IN_MILLISECONDS: timeoutInMilliseconds.default(60_000),
});

function toSagaTimeouts(
  stepTimeoutInMilliseconds: number,
  paymentTimeoutInMilliseconds: number,
): PlaceOrderSagaTimeoutsInMilliseconds {
  return {
    VERIFYING_CONSUMER: stepTimeoutInMilliseconds,
    CREATING_TICKET: stepTimeoutInMilliseconds,
    AUTHORIZING_PAYMENT: paymentTimeoutInMilliseconds,
    APPROVING_TICKET: stepTimeoutInMilliseconds,
    REJECTING_TICKET: stepTimeoutInMilliseconds,
  };
}

export function readOrderServiceConfiguration(
  environment: NodeJS.ProcessEnv,
): OrderServiceConfiguration {
  const variables = parseEnvironment(orderServiceEnvironmentSchema, environment);
  return {
    databaseUrl: variables.ORDER_DATABASE_URL,
    kafkaBootstrapServers: variables.KAFKA_BOOTSTRAP_SERVERS,
    host: variables.ORDER_SERVICE_HOST,
    port: variables.ORDER_SERVICE_PORT,
    logLevel: variables.LOG_LEVEL,
    sagaTimeoutsInMilliseconds: toSagaTimeouts(
      variables.PLACE_ORDER_SAGA_STEP_TIMEOUT_IN_MILLISECONDS,
      variables.PLACE_ORDER_SAGA_PAYMENT_TIMEOUT_IN_MILLISECONDS,
    ),
  };
}
