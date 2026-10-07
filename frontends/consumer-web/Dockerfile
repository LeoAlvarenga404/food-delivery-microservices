FROM node:24.19.0-bookworm-slim AS build
RUN npm install --global pnpm@10.19.0
ENV npm_config_store_dir=/pnpm-store NEXT_TELEMETRY_DISABLED=1
WORKDIR /repository
COPY . .
RUN --mount=type=cache,id=pnpm-store,target=/pnpm-store \
    npm pkg delete scripts.prepare \
    && pnpm install --frozen-lockfile --filter @fd/consumer-web \
    && pnpm --filter @fd/consumer-web generate \
    && pnpm --filter @fd/consumer-web build

FROM node:24.19.0-bookworm-slim
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1 HOSTNAME=0.0.0.0 PORT=3000
WORKDIR /application
COPY --from=build /repository/frontends/consumer-web/.next/standalone ./
COPY --from=build /repository/frontends/consumer-web/.next/static ./frontends/consumer-web/.next/static
RUN mkdir frontends/consumer-web/.next/cache && chown node:node frontends/consumer-web/.next/cache
USER node
WORKDIR /application/frontends/consumer-web
CMD ["node", "server.js"]
