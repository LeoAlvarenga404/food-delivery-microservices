import { describe, expect, it } from 'vitest';
import { fileNameCatalogue } from './file-name-catalogue.ts';
import { findFileNameViolations } from './find-file-name-violations.ts';

function reasonsFor(path: string): readonly string[] {
  return findFileNameViolations([path], fileNameCatalogue).map((violation) => violation.reason);
}

describe('findFileNameViolations', () => {
  it.each([
    'package.json',
    'tsconfig.base.json',
    'pnpm-lock.yaml',
    '.github/workflows/ci.yml',
    '.husky/pre-commit',
    'services/order/src/main.ts',
    'services/order/src/domain/order/order.aggregate.ts',
    'services/order/src/domain/order/order.aggregate.spec.ts',
    'services/order/src/application/commands/place-order/place-order.command-handler.ts',
    'services/order/src/infrastructure/persistence/postgres-order.repository.integration.spec.ts',
    'services/order/src/infrastructure/persistence/migrations/0001-create-orders-table.sql',
    'services/order/test/support/in-memory-order.repository.ts',
    'services/order/test/place-order.component.spec.ts',
    'services/order/src/infrastructure/persistence/generated/database.ts',
    'packages/domain/src/either.ts',
    'packages/chassis/kafka/src/consumer-runner.ts',
    'tooling/src/eslint/no-comments.rule.ts',
    'tooling/src/file-names/check-file-names.cli.ts',
    'packages/domain/src/index.ts',
    'packages/domain/vitest.config.ts',
    'tooling/vitest.config.ts',
    'packages/contracts/buf.gen.yaml',
    'packages/contracts/proto/fooddelivery/order/v1/events.proto',
    'packages/contracts/samples/order.order.events/OrderPlaced.json',
    'packages/contracts/samples/order.place-order-saga.replies/TicketCreated.json',
  ])('accepts %s', (path) => {
    expect(reasonsFor(path)).toEqual([]);
  });

  it.each([
    ['services/order/src/domain/Order/order.aggregate.ts', 'directory "Order" is not kebab-case'],
    [
      'services/order/src/domain/order/OrderAggregate.ts',
      'concept "OrderAggregate" is not kebab-case',
    ],
    [
      'services/order/src/domain/order/order.weird.ts',
      'role ".weird" is not allowed in service domain layer',
    ],
    [
      'services/order/src/domain/order/order.consumer.ts',
      'role ".consumer" is not allowed in service domain layer',
    ],
    [
      'services/order/src/domain/order/order.ts',
      'file "order.ts" needs a role suffix in service domain layer',
    ],
    [
      'services/order/src/main-entry.ts',
      'file "main-entry.ts" needs a role suffix in service source outside layers',
    ],
    [
      'services/order/src/domain/order/order.json',
      'only .ts files are allowed in service domain layer',
    ],
    [
      'services/order/src/infrastructure/persistence/migrations/create-orders.sql',
      'migration "create-orders.sql" must be named NNNN-kebab-name.sql',
    ],
    [
      'packages/domain/src/either.helper.ts',
      'role ".helper" is not allowed in shared package source',
    ],
    ['tooling/src/Readme.ts', 'concept "Readme" is not kebab-case'],
    [
      'services/order/src/shared/order.weird.ts',
      'role ".weird" is not allowed in service source outside layers',
    ],
    [
      'packages/domain/order.weird.ts',
      'role ".weird" is not allowed in TypeScript outside catalogued folders',
    ],
    ['e2e/order.weird.ts', 'role ".weird" is not allowed in TypeScript outside catalogued folders'],
    ['packages/domain/src/nested/index.ts', 'file "index.ts" is allowed only as package entry'],
    ['services/order/test/support/index.ts', 'file "index.ts" is allowed only as package entry'],
    [
      'services/order/test/support/helpers.ts',
      'file "helpers.ts" needs a role suffix in service test support',
    ],
    [
      'services/order/src/domain/order/order.consumer.spec.ts',
      'role ".consumer" is not allowed in service domain layer',
    ],
    [
      'services/order/src/domain/order/order.aggregate.extra.ts',
      'file "order.aggregate.extra.ts" does not follow <concept>.<role>.ts',
    ],
    ['infra/Envoy.yaml', 'file name "Envoy.yaml" is not kebab-case'],
    [
      'services/order/src/infrastructure/persistence/generated/orders.ts',
      'file "orders.ts" needs a role suffix in generated database types',
    ],
    [
      'services/order/src/infrastructure/persistence/generated/database.repository.ts',
      'role ".repository" is not allowed in generated database types',
    ],
    [
      'services/order/src/infrastructure/persistence/generated/nested/database.ts',
      'file "database.ts" needs a role suffix in generated database types',
    ],
    [
      'services/order/src/infrastructure/persistence/generated/database.spec.ts',
      'file "database.spec.ts" needs a role suffix in generated database types',
    ],
    [
      'packages/contracts/samples/Order.Events/OrderPlaced.json',
      'topic directory "Order.Events" is not a topic name',
    ],
    [
      'packages/contracts/samples/order.order.events/order-placed.json',
      'golden sample "order-placed.json" must be <MessageType>.json',
    ],
    [
      'packages/contracts/samples/OrderPlaced.json',
      'golden sample must be samples/<topic>/<MessageType>.json',
    ],
  ])('rejects %s', (path, expectedReason) => {
    expect(reasonsFor(path)).toEqual([expectedReason]);
  });
});
