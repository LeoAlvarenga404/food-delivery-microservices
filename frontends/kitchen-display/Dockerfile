FROM node:24.19.0-bookworm-slim AS build
RUN npm install --global pnpm@10.19.0
ENV npm_config_store_dir=/pnpm-store
ARG VITE_KEYCLOAK_ISSUER_URL
WORKDIR /repository
COPY . .
RUN --mount=type=cache,id=pnpm-store,target=/pnpm-store \
    npm pkg delete scripts.prepare \
    && pnpm install --frozen-lockfile --filter @fd/kitchen-display \
    && pnpm --filter @fd/kitchen-display generate \
    && pnpm --filter @fd/kitchen-display build

FROM nginxinc/nginx-unprivileged:1.30.5-alpine
COPY frontends/kitchen-display/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /repository/frontends/kitchen-display/dist /usr/share/nginx/html
