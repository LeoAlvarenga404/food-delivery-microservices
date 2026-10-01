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
    'packages/domain/src/either.ts',
    'packages/chassis/kafka/src/consumer-runner.ts',
    'tooling/src/eslint/no-comments.rule.ts',
    'tooling/src/file-names/check-file-names.cli.ts',
  ])('accepts %s', (path) => {
    expect(reasonsFor(path)).toEqual([]);
  });

  it.each([
    ['services/order/src/Domain/order/order.aggregate.ts', 'directory "Domain" is not kebab-case'],
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
      'file "main-entry.ts" needs a role suffix in service source root',
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
    ['infra/Envoy.yaml', 'file name "Envoy.yaml" is not kebab-case'],
  ])('rejects %s', (path, expectedReason) => {
    expect(reasonsFor(path)).toEqual([expectedReason]);
  });
});
