# syntax=docker/dockerfile:1.7

FROM node:22-alpine AS build
WORKDIR /app

# Labs-proxied base path. Overridable, but defaults to the registered slug path.
ARG VITE_BASE_PATH=/experiments/observation-app/
ENV VITE_BASE_PATH=$VITE_BASE_PATH

ENV HUSKY=0

COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund

COPY . .
# Labs auth is the default mode (VITE_AUTH_MODE unset => 'labs').
RUN npx vue-tsc --noEmit && npx vite build

FROM nginxinc/nginx-unprivileged:1.27-alpine AS runtime
COPY --from=build --chown=nginx:nginx /app/dist /usr/share/nginx/html
COPY --chown=nginx:nginx nginx.conf /etc/nginx/conf.d/default.conf

EXPOSE 8080
HEALTHCHECK --interval=30s --timeout=3s --retries=3 \
  CMD wget -qO- http://127.0.0.1:8080/ >/dev/null || exit 1
