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

## Extracción automática de PDFs (Claude Vision)

El backend expone `POST /api/extract` para extraer datos estructurados
de PDFs e imágenes (CSF, INE, comprobante de domicilio, factura del
bien, acta constitutiva). El frontend lo consume desde los wizards de
Cliente Nuevo y Nueva Operación con el botón "Autollenar desde…".

### Activación

Por default está en modo `MOCK` (devuelve datos hardcodeados marcados
con un warning, útil para desarrollo y para que el botón siga vivo
cuando la API key no esté configurada).

Para activar Claude Vision real:

```bash
# server/.env
EXTRACT_PROVIDER=CLAUDE
ANTHROPIC_API_KEY=sk-ant-...      # se obtiene en console.anthropic.com
ANTHROPIC_MODEL=claude-sonnet-4-5-20250929   # opcional, este es el default
```

Si `EXTRACT_PROVIDER=CLAUDE` pero falta `ANTHROPIC_API_KEY`, el
endpoint responde `503 EXTRACT_DISABLED` con mensaje legible (el
frontend lo muestra al usuario sin tumbar el wizard).

### Tipos soportados

| `tipo`                  | Descripción                       | Schema (campos)                                                                                  |
|-------------------------|-----------------------------------|--------------------------------------------------------------------------------------------------|
| `CSF`                   | Constancia de Situación Fiscal    | rfc, razonSocial, curp, regimenFiscal, codigoPostal, domicilioFiscal, fechaInicioOperaciones, estatusPadron |
| `INE`                   | Identificación oficial (anverso)  | nombre, apellidoPaterno, apellidoMaterno, curp, claveElector, fechaNacimiento, vigencia, domicilio, sexo |
| `COMPROBANTE_DOMICILIO` | CFE / Telmex / agua / predial     | emisor, titular, direccion, codigoPostal, fechaEmision, periodo                                  |
| `FACTURA_BIEN`          | Factura del proveedor del bien    | proveedor, rfcProveedor, bienDescripcion, bienMarca, bienModelo, bienAnio, bienNumSerie, valorBienSinIVA, ivaTrasladado, valorBienConIVA, fechaFactura, folio |
| `ACTA_CONSTITUTIVA`     | Acta constitutiva (PM)            | razonSocial, fechaConstitucion, numeroEscritura, notario, numeroNotaria, ciudadNotaria, capitalSocial, duracion, objetoSocial, representanteLegal |

### Request / Response

```http
POST /api/extract
Authorization: Bearer <jwt>
Content-Type: multipart/form-data

archivo=@CSF.pdf
tipo=CSF
```

```json
{
  "ok": true,
  "provider": "CLAUDE",
  "confidence": 0.875,
  "data": { "rfc": "XAXX010101000", "...": "..." },
  "warning": "Confianza baja (0.42). Verifica los campos extraídos."
}
```

### Límites y errores

- **Formatos**: pdf, jpg, jpeg, png, webp.
- **Tamaño**: máximo 10 MB.
- **Errores**: `400 INVALID_TIPO`, `400 FILE_REQUIRED`,
  `400 FILE_TYPE_INVALID`, `400 FILE_TOO_LARGE`,
  `502 EXTRACT_PROVIDER_ERROR`, `503 EXTRACT_DISABLED`.

### Costos (estimación 04-2026)

Con `claude-sonnet-4-5-20250929`, un PDF típico de 2–4 páginas cuesta
≈ **$0.012 USD por extracción** ($3/M input + $15/M output, ~3500
tokens input + ~400 tokens output). Para 1000 extracciones/mes ≈
$12 USD. La extracción es **on-demand** (solo cuando el usuario hace
click en "Autollenar"), no automática.

### Política de mapeo en el frontend

Los handlers del wizard **NUNCA sobreescriben** un campo que ya tenga
valor. Esto permite:
- Extraer múltiples documentos del mismo cliente (CSF + INE) y que
  cada uno complemente al anterior.
- Que el usuario corrija manualmente un campo extraído mal y siga
  extrayendo otros documentos sin perder la corrección.

---

## Continuous Integration

GitHub Actions corre en cada PR a `main`:
- `client`: `npm install` + `npm run build` + `npm test`
- `server`: `npm install` + `tsc --noEmit` + `npm test`

Postgres ephemeral via service container para los tests del server que
lo necesiten (actualmente 0 — los tests son unitarios).
