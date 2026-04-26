# syntax=docker/dockerfile:1.7
#
# Inyecta Arrendamiento — Backend (Node + Express + Prisma)
# ─────────────────────────────────────────────────────────────────
# Multi-stage:
#   1. deps    → instala TODAS las dependencias (incluyendo dev) y
#                corre prisma generate. Necesita devDeps porque
#                tsx/typescript se usan en build y prisma CLI vive en
#                devDependencies.
#   2. build   → compila TS a dist/. Requiere prisma generate haya
#                corrido antes (los tipos de @prisma/client se generan
#                en node_modules/.prisma/client).
#   3. runtime → imagen final con sólo deps de producción + dist +
#                schema/migraciones de Prisma + carpeta uploads/.
#                Corre como usuario no-root.
#
# Por qué node:20-bookworm-slim (Debian) en vez de Alpine:
#   Prisma Client tiene un binario nativo distinto por libc. Debian
#   usa glibc, Alpine usa musl. Con bookworm-slim, el binario "native"
#   detectado en `prisma generate` funciona sin necesidad de declarar
#   `binaryTargets` extra en schema.prisma. Si en el futuro pasamos a
#   alpine, agregar `binaryTargets = ["native", "linux-musl-openssl-3.0.x"]`.
#
# El build NO depende de variables runtime (DATABASE_URL, JWT_SECRET).
# Esas se inyectan en el contenedor en runtime via env_file/secrets.

# ─────────────────────────────────────────────────────────────────
# Stage 1 · deps — todas las dependencias + prisma generate
# ─────────────────────────────────────────────────────────────────
FROM node:20-bookworm-slim AS deps
WORKDIR /app

# OpenSSL es runtime dep de Prisma. bookworm-slim no la trae por
# default. ca-certificates para fetches HTTPS desde npm/cualquier
# init script.
RUN apt-get update && apt-get install -y --no-install-recommends \
    openssl \
    ca-certificates \
  && rm -rf /var/lib/apt/lists/*

# Instalar deps. npm ci respeta el lockfile y es más rápido que install.
COPY package.json package-lock.json ./
RUN npm ci

# Schema + migraciones para `prisma generate`. NO copiamos src/ aquí
# para que cualquier cambio en código no invalide este layer.
COPY prisma ./prisma
RUN npx prisma generate

# ─────────────────────────────────────────────────────────────────
# Stage 2 · build — compila TS a dist/
# ─────────────────────────────────────────────────────────────────
FROM deps AS build
WORKDIR /app

# Source completo. node_modules y .prisma/client ya están del layer deps.
COPY tsconfig.json ./
COPY src ./src

# tsc compila a ./dist. Si falla, falla el build.
RUN npm run build

# ─────────────────────────────────────────────────────────────────
# Stage 3 · runtime — imagen final mínima
# ─────────────────────────────────────────────────────────────────
FROM node:20-bookworm-slim AS runtime
WORKDIR /app

ENV NODE_ENV=production \
    PORT=3001

# OpenSSL + curl (curl para el HEALTHCHECK).
RUN apt-get update && apt-get install -y --no-install-recommends \
    openssl \
    ca-certificates \
    curl \
    tini \
  && rm -rf /var/lib/apt/lists/*

# Instalar SOLO deps de producción para reducir tamaño. devDependencies
# (tsx, typescript, prisma CLI, vitest) no se necesitan en runtime —
# `prisma migrate deploy` viene del paquete @prisma/client + el binario
# que se copia desde deps en el COPY de abajo.
COPY package.json package-lock.json ./
RUN npm ci --omit=dev

# Generar el cliente prisma en esta etapa (necesita los archivos de
# prisma/, que copiamos justo abajo). Esto crea node_modules/.prisma/
# client compatible con la imagen final. No depende de DATABASE_URL.
COPY prisma ./prisma
RUN npx prisma generate

# Código compilado.
COPY --from=build /app/dist ./dist

# Carpeta uploads (PDFs de contratos, expedientes). Si se monta un
# volumen aquí, esta línea es no-op; si no, el directorio existe para
# que multer no falle al crearlo.
RUN mkdir -p uploads && chown -R node:node uploads dist

# Usuario no-root. La imagen base de node ya trae `node` (uid=1000).
USER node

EXPOSE 3001

# tini como PID 1 para reapeo correcto de signals (SIGTERM → graceful
# shutdown via lib/shutdown.ts).
ENTRYPOINT ["/usr/bin/tini", "--"]

# Healthcheck contra /api/health/live (no toca BD, no se cae si Postgres
# está degradado). Si /api/health (ping a BD) fallara, el orquestador
# debe sacar el pod del LB pero NO matarlo — eso lo decide el
# readinessProbe en k8s, fuera de este Dockerfile.
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD curl -fsS http://localhost:3001/api/health/live || exit 1

CMD ["node", "dist/index.js"]
