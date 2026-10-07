FROM node:24.19.0-bookworm-slim AS build
RUN npm install --global pnpm@10.19.0
ENV npm_config_store_dir=/pnpm-store
ARG VITE_KEYCLOAK_ISSUER_URL
WORKDIR /repository
COPY . .
RUN --mount=type=cache,id=pnpm-store,target=/pnpm-store \
    npm pkg delete scripts.prepare \
    && pnpm install --frozen-lockfile --filter @fd/restaurant-portal \
    && pnpm --filter @fd/restaurant-portal generate \
    && pnpm --filter @fd/restaurant-portal build

FROM nginxinc/nginx-unprivileged:1.30.5-alpine
COPY frontends/restaurant-portal/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /repository/frontends/restaurant-portal/dist /usr/share/nginx/html
