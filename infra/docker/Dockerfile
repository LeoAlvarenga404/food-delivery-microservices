FROM node:24.19.0-bookworm-slim AS base
RUN npm install --global pnpm@10.19.0
ENV npm_config_store_dir=/pnpm-store
WORKDIR /repository

FROM base AS contracts
COPY . .
RUN --mount=type=cache,id=pnpm-store,target=/pnpm-store \
    pnpm install --frozen-lockfile --filter @fd/contracts \
    && pnpm --filter @fd/contracts generate

FROM base AS dependencies
ARG PACKAGE_NAME
COPY . .
RUN --mount=type=cache,id=pnpm-store,target=/pnpm-store \
    npm pkg delete scripts.prepare \
    && pnpm install --frozen-lockfile --prod --filter-prod "${PACKAGE_NAME}..."

FROM node:24.19.0-bookworm-slim
ARG PACKAGE_DIRECTORY
ENV NODE_ENV=production
COPY --from=dependencies /repository /repository
COPY --from=contracts /repository/packages/contracts/src/generated /repository/packages/contracts/src/generated
USER node
WORKDIR /repository/${PACKAGE_DIRECTORY}
CMD ["node", "src/main.ts"]
