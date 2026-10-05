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
    'bffs/consumer-bff/src/main.ts',
    'bffs/consumer-bff/src/main.spec.ts',
    'bffs/consumer-bff/src/consumer-bff.config.ts',
    'bffs/consumer-bff/src/orders/order.routes.ts',
    'bffs/consumer-bff/src/orders/order.routes.spec.ts',
    'bffs/consumer-bff/src/orders/order-view.message-mapper.ts',
    'bffs/consumer-bff/src/http/problem-details.adapter.ts',
    'bffs/consumer-bff/test/consumer-bff.component.spec.ts',
    'bffs/consumer-bff/test/support/order-service.fake.ts',
    'bffs/consumer-bff/vitest.config.ts',
    'e2e/test/place-order.e2e.spec.ts',
    'e2e/test/support/http-consumer-api.adapter.ts',
    'e2e/vitest.config.ts',
    'e2e/playwright.config.ts',
    'e2e/browser/consumer-web.e2e.spec.ts',
    'e2e/browser/support/consumer-web-browser.adapter.ts',
    'frontends/consumer-web/next.config.ts',
    'frontends/consumer-web/Dockerfile',
    'frontends/consumer-web/src/app/layout.tsx',
    'frontends/consumer-web/src/app/page.tsx',
    'frontends/consumer-web/src/app/restaurants/[restaurantId]/page.tsx',
    'frontends/consumer-web/src/app/auth/callback/route.ts',
    'frontends/consumer-web/src/cart/cart.hook.ts',
    'frontends/consumer-web/src/cart/cart.hook.spec.ts',
    'frontends/consumer-web/src/cart/add-to-cart.component.tsx',
    'frontends/consumer-web/src/orders/place-order.action.ts',
    'frontends/consumer-web/src/session/session-cookie.adapter.ts',
    'frontends/consumer-web/src/search/search-highlight.message-mapper.ts',
    'frontends/consumer-web/src/consumer-web.config.ts',
    'infra/docker/Dockerfile',
    'infra/envoy/envoy.yaml',
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
    [
      'bffs/consumer-bff/src/orders/order.aggregate.ts',
      'role ".aggregate" is not allowed in bff source',
    ],
    ['bffs/consumer-bff/src/server.ts', 'file "server.ts" needs a role suffix in bff source'],
    [
      'bffs/consumer-bff/test/support/helpers.ts',
      'file "helpers.ts" needs a role suffix in bff test support',
    ],
    ['e2e/test/support/stack.ts', 'file "stack.ts" needs a role suffix in end-to-end tests'],
    ['e2e/test/orders.routes.ts', 'role ".routes" is not allowed in end-to-end tests'],
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
    [
      'frontends/consumer-web/src/app/home.tsx',
      'file "home.tsx" needs a role suffix in frontend routes',
    ],
    [
      'frontends/consumer-web/src/app/cart/cart.component.tsx',
      'role ".component" is not allowed in frontend routes',
    ],
    [
      'frontends/consumer-web/src/cart/cart.tsx',
      'file "cart.tsx" needs a role suffix in frontend source',
    ],
    [
      'frontends/consumer-web/src/cart/cart.store.ts',
      'role ".store" is not allowed in frontend source',
    ],
    [
      'frontends/consumer-web/src/cart/cart.component.jsx',
      'only .ts and .tsx files are allowed in frontend source',
    ],
    [
      'frontends/consumer-web/src/app/restaurants/[restaurant_id]/page.tsx',
      'directory "[restaurant_id]" is not kebab-case',
    ],
    [
      'frontends/consumer-web/src/cart/[restaurantId]/cart.hook.ts',
      'directory "[restaurantId]" is not kebab-case',
    ],
    [
      'services/order/src/domain/order/order.aggregate.tsx',
      'only .ts files are allowed in service domain layer',
    ],
    [
      'e2e/browser/consumer-web.ts',
      'file "consumer-web.ts" needs a role suffix in end-to-end tests',
    ],
  ])('rejects %s', (path, expectedReason) => {
    expect(reasonsFor(path)).toEqual([expectedReason]);
  });
});
