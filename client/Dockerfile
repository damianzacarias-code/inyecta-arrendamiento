# syntax=docker/dockerfile:1.7
#
# Inyecta Arrendamiento — Frontend (React + Vite)
# ─────────────────────────────────────────────────────────────────
# Multi-stage:
#   1. build   → npm ci + vite build → dist/ (estático)
#   2. runtime → nginx:alpine sirviendo dist/ con SPA fallback
#
# El cliente NO consume env vars en runtime (todo el estado de
# cotización/branding/catálogo se hidrata desde el backend al boot
# vía /api/config/*). El URL del backend se conoce vía proxy_pass
# del nginx (ver client/nginx.conf), no via VITE_API_URL.
#
# Si en el futuro necesitamos diferenciar dev/staging/prod desde el
# build, agregar `ARG VITE_API_BASE` aquí y `--build-arg` en el
# orquestador. Hoy es innecesario porque el frontend siempre habla
# con `/api` relativo y nginx hace el proxy.

# ─────────────────────────────────────────────────────────────────
# Stage 1 · build
# ─────────────────────────────────────────────────────────────────
FROM node:20-bookworm-slim AS build
WORKDIR /app

# Cache layer de deps (no se reinstala si sólo cambia src/).
COPY package.json package-lock.json ./
RUN npm ci

# Source + tsconfig + vite config + assets.
COPY tsconfig*.json vite.config.ts vitest.config.ts eslint.config.js index.html ./
COPY public ./public
COPY src ./src

# `tsc -b && vite build` → ./dist
RUN npm run build

# ─────────────────────────────────────────────────────────────────
# Stage 2 · runtime — nginx alpine
# ─────────────────────────────────────────────────────────────────
FROM nginx:1.27-alpine AS runtime

# Config de nginx con:
#   - SPA fallback (try_files $uri /index.html) para react-router
#   - Proxy /api/* al backend (definido por env NGINX_BACKEND, default
#     "server:3001" — el nombre del servicio en docker-compose.prod.yml)
#   - Cache larga para assets versionados (vite genera hashes en el
#     filename, así que invalidar es just deploy nuevo)
#   - gzip básico
COPY nginx.conf /etc/nginx/conf.d/default.conf

# Copiar el build estático.
COPY --from=build /app/dist /usr/share/nginx/html

EXPOSE 80

# nginx alpine ya define un HEALTHCHECK implícito vía el comando
# default. Lo hacemos explícito para que docker-compose pueda
# orquestar el dependson:condition:service_healthy.
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD wget --quiet --tries=1 --spider http://localhost/ || exit 1

CMD ["nginx", "-g", "daemon off;"]
