#!/usr/bin/env bash
# backup_db.sh — Dump comprimido de Postgres con rotación.
#
# Uso:
#   ./scripts/backup_db.sh                           # usa server/.env
#   DATABASE_URL=postgresql://... ./scripts/backup_db.sh
#   BACKUP_DIR=/mnt/backups RETENTION_DAYS=90 ./scripts/backup_db.sh
#
# Cron sugerido (diario 03:00 AM):
#   0 3 * * * cd /opt/inyecta && ./scripts/backup_db.sh >> /var/log/inyecta-backup.log 2>&1
#
# Comportamiento:
#   • Lee DATABASE_URL del entorno; si no, lo extrae de server/.env.
#   • Genera dump con `pg_dump --format=custom` (más compacto y
#     restaurable selectivamente que --format=plain).
#   • Lo comprime con gzip (-9) y le pone timestamp UTC.
#   • Borra dumps más viejos que RETENTION_DAYS.
#   • Sale con código != 0 si algo falla → el cron loggea el error.

set -euo pipefail

# ── Config ────────────────────────────────────────────────────────────
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"
BACKUP_DIR="${BACKUP_DIR:-${HOME}/.inyecta-backups}"
RETENTION_DAYS="${RETENTION_DAYS:-30}"

# ── DATABASE_URL ──────────────────────────────────────────────────────
if [[ -z "${DATABASE_URL:-}" ]]; then
  if [[ -f "${REPO_ROOT}/server/.env" ]]; then
    # Extrae DATABASE_URL respetando comillas dobles si las hay.
    DATABASE_URL=$(grep -E '^DATABASE_URL=' "${REPO_ROOT}/server/.env" \
      | head -n1 | cut -d= -f2- | sed 's/^"//;s/"$//')
  fi
fi
if [[ -z "${DATABASE_URL:-}" ]]; then
  echo "[backup_db] ERROR: DATABASE_URL no está definido y server/.env no existe o no lo contiene." >&2
  exit 2
fi

# ── Verifica pg_dump ──────────────────────────────────────────────────
if ! command -v pg_dump >/dev/null 2>&1; then
  echo "[backup_db] ERROR: pg_dump no encontrado en PATH. Instala postgresql-client." >&2
  exit 3
fi

# ── Prepara destino ───────────────────────────────────────────────────
mkdir -p "${BACKUP_DIR}"
TIMESTAMP=$(date -u +"%Y-%m-%d_%H-%M-%S")
DUMP_FILE="${BACKUP_DIR}/inyecta_${TIMESTAMP}.dump.gz"
TMP_FILE="${DUMP_FILE}.tmp"

echo "[backup_db] start ts=${TIMESTAMP} dir=${BACKUP_DIR}"

# ── Dump → gzip → archivo final ───────────────────────────────────────
# Pipe directo: nunca dejamos el .dump sin comprimir en disco.
# Si pg_dump falla, set -o pipefail propaga el error y borramos el .tmp.
trap 'rm -f "${TMP_FILE}"' EXIT
pg_dump --format=custom --no-owner --no-acl --compress=0 "${DATABASE_URL}" \
  | gzip -9 > "${TMP_FILE}"

# Sanity check: el dump debe tener tamaño > 0.
if [[ ! -s "${TMP_FILE}" ]]; then
  echo "[backup_db] ERROR: dump quedó vacío. Abortando." >&2
  exit 4
fi

mv "${TMP_FILE}" "${DUMP_FILE}"
trap - EXIT

DUMP_SIZE=$(du -h "${DUMP_FILE}" | cut -f1)
echo "[backup_db] OK file=${DUMP_FILE} size=${DUMP_SIZE}"

# ── Rotación: borra dumps > RETENTION_DAYS ────────────────────────────
DELETED=$(find "${BACKUP_DIR}" -maxdepth 1 -type f -name 'inyecta_*.dump.gz' \
  -mtime +"${RETENTION_DAYS}" -print -delete | wc -l | tr -d ' ')
echo "[backup_db] retention=${RETENTION_DAYS}d deleted=${DELETED}"

# ── Resumen final ─────────────────────────────────────────────────────
TOTAL=$(find "${BACKUP_DIR}" -maxdepth 1 -type f -name 'inyecta_*.dump.gz' | wc -l | tr -d ' ')
echo "[backup_db] done total_backups=${TOTAL}"
