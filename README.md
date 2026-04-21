# Inyecta Arrendamiento — Sistema

Backend + frontend del sistema de arrendamiento financiero y puro de
**FSMP Soluciones de Capital, S.A. de C.V., SOFOM, E.N.R.** (marca:
Inyecta).

> Para detalles de fórmulas financieras, navegación, design tokens y
> reglas de negocio: ver `server/CLAUDE.md`. Es la fuente de verdad
> del proyecto.

---

## Estructura

```
sistema/
├── client/          React 19 + Vite + TypeScript + Tailwind + Vitest
├── server/          Node 20 + Express + Prisma + Postgres + Vitest
├── scripts/         Utilidades (conciliación bancaria, backups, etc.)
└── docs/            Documentación operativa (LOGICA_COBRANZA, etc.)
```

---

## Requisitos

| Herramienta | Versión mínima | Cómo verificar         |
|-------------|----------------|------------------------|
| Node.js     | 20.x           | `node -v`              |
| npm         | 10.x           | `npm -v`               |
| PostgreSQL  | 14.x           | `psql --version`       |
| Docker¹     | 24.x (opcional)| `docker --version`     |

¹ Solo si quieres levantar Postgres con `docker compose` en lugar de
instalarlo nativamente.

---

## Setup en 5 minutos

### 1. Clonar e instalar

```bash
git clone <repo>
cd sistema
(cd client && npm install)
(cd server && npm install)
```

### 2. Postgres local

**Opción A — docker compose (recomendado)**

```bash
docker compose up -d db
```

Esto levanta Postgres 16 en `localhost:5432` con credenciales
`postgres / postgres` y la base `inyecta_arrendamiento`.

**Opción B — Postgres nativo**

```bash
createdb inyecta_arrendamiento
```

### 3. Variables de entorno

```bash
cp server/.env.example server/.env
```

Edita `server/.env` si tu Postgres usa credenciales distintas. La
validación se hace con Zod en `server/src/config/env.ts` — si algo
falta o es inválido, el server NO arranca y te dice exactamente qué.

### 4. Migraciones + seed

```bash
cd server
npx prisma migrate dev    # aplica migraciones
npm run db:seed           # crea usuarios, catálogos y datos demo
```

### 5. Levantar

En dos terminales:

```bash
# Terminal 1 — backend (puerto 3001)
cd server && npm run dev

# Terminal 2 — frontend (puerto 5173)
cd client && npm run dev
```

Abrir http://localhost:5173. Login con cualquier usuario del seed
(ver `server/src/seed.ts`).

---

## Comandos comunes

### Backend (`cd server`)

| Comando                      | Qué hace                                      |
|------------------------------|-----------------------------------------------|
| `npm run dev`                | Arranque con hot-reload (`tsx watch`)         |
| `npm run build`              | Compila a `dist/`                             |
| `npm start`                  | Ejecuta el build (`node dist/index.js`)       |
| `npm test`                   | Tests unitarios (vitest, sin BD)              |
| `npm run test:watch`         | Tests en modo watch                           |
| `npm run test:coverage`      | Coverage report (v8, HTML en `coverage/`)     |
| `npm run verify:health`      | Smoke E2E del `/api/health` (rama OK + 503)   |
| `npm run verify:errorHandler`| Smoke E2E del errorHandler (Prisma/Zod reales)|
| `npm run db:migrate`         | `prisma migrate dev`                          |
| `npm run db:seed`            | Reset + datos demo                            |
| `npm run db:studio`          | Prisma Studio en http://localhost:5555        |

### Frontend (`cd client`)

| Comando             | Qué hace                                |
|---------------------|------------------------------------------|
| `npm run dev`       | Vite dev server (puerto 5173)            |
| `npm run build`     | TypeScript check + build de producción   |
| `npm run preview`   | Sirve el build localmente                |
| `npm test`          | Tests unitarios (38 tests del core)      |
| `npm run lint`      | ESLint                                   |

---

## Endpoints clave

| Método | Path                  | Descripción                                  |
|--------|-----------------------|----------------------------------------------|
| GET    | `/api/health`         | Liveness + DB ping (200 OK / 503 degraded)   |
| GET    | `/api/health/live`    | Solo liveness (no toca BD) — k8s liveness    |
| POST   | `/api/auth/login`     | Login (rate-limited: 5 intentos / 15min / IP)|
| GET    | `/api/auth/me`        | Usuario actual                                |

Todos los endpoints bajo `/api` (excepto health y auth/login) requieren
`Authorization: Bearer <jwt>`.

---

## Observabilidad

- **Request ID**: cada response incluye `X-Request-ID`. Si entras
  como cliente puedes pasar uno propio (validado: ≤200 chars, charset
  `[A-Za-z0-9_\-:.]`); si no, generamos un UUID v4.
- **Logs**: pino estructurado. En producción JSON una-línea (parseable
  por CloudWatch / Datadog / Loki). En desarrollo `pino-pretty`.
- **Bitácora PLD**: toda escritura autenticada queda en la tabla
  `bitacora` con el `requestId`, `usuarioId`, `payloadJson` (sanitizado),
  `responseStatus`, `ip` y `userAgent`. Visible en `/admin/bitacora`
  para roles ADMIN y DIRECTOR.
- **Errores**: formato uniforme
  `{ error: { code, message, details?, requestId? } }`. Códigos
  estables (e.g. `UNIQUE_VIOLATION`, `VALIDATION_ERROR`,
  `RATE_LIMITED`).

---

## Pruebas

```bash
# Servidor
cd server && npm test          # 40 tests, ~200ms
# Cliente
cd client && npm test          # 38 tests, ~3s
```

Tests E2E que sí tocan la BD se corren manualmente con
`npm run verify:health` y `npm run verify:errorHandler`.

---

## Backup / restore

Script en `scripts/backup_db.sh`. Por default guarda dumps comprimidos
en `~/.inyecta-backups/` con rotación de 30 días.

```bash
# Backup manual
./scripts/backup_db.sh

# Restore (interactivo, pide confirmación):
./scripts/restore_db.sh ~/.inyecta-backups/inyecta_2026-04-21_03-15-00.sql.gz
```

Para programarlo, ver `scripts/backup_db.sh` (incluye snippet de cron).

---

## Continuous Integration

GitHub Actions corre en cada PR a `main`:
- `client`: `npm install` + `npm run build` + `npm test`
- `server`: `npm install` + `tsc --noEmit` + `npm test`

Postgres ephemeral via service container para los tests del server que
lo necesiten (actualmente 0 — los tests son unitarios).
