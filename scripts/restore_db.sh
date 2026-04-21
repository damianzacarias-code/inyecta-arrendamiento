#!/usr/bin/env bash
# restore_db.sh — Restaura un dump generado por backup_db.sh.
#
# Uso:
#   ./scripts/restore_db.sh ~/.inyecta-backups/inyecta_2026-04-21_03-15-00.dump.gz
#   DATABASE_URL=postgresql://... ./scripts/restore_db.sh <dump>
#
# DESTRUCTIVO: dropea y recrea las tablas del schema. Pide confirmación
# explícita antes de hacer nada.
#
# Estrategia:
#   1. Verifica que el dump exista y sea legible.
#   2. Pide confirmación interactiva (a menos que NONINTERACTIVE=1).
#   3. Descomprime + pg_restore --clean --if-exists --no-owner --no-acl.

set -euo pipefail

if [[ $# -lt 1 ]]; then
  echo "Uso: $0 <archivo.dump.gz>" >&2
  exit 64
fi

DUMP_FILE="$1"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"

if [[ ! -r "${DUMP_FILE}" ]]; then
  echo "[restore_db] ERROR: no puedo leer ${DUMP_FILE}" >&2
  exit 2
fi

# ── DATABASE_URL ──────────────────────────────────────────────────────
if [[ -z "${DATABASE_URL:-}" ]]; then
  if [[ -f "${REPO_ROOT}/server/.env" ]]; then
    DATABASE_URL=$(grep -E '^DATABASE_URL=' "${REPO_ROOT}/server/.env" \
      | head -n1 | cut -d= -f2- | sed 's/^"//;s/"$//')
  fi
fi
if [[ -z "${DATABASE_URL:-}" ]]; then
  echo "[restore_db] ERROR: DATABASE_URL no está definido." >&2
  exit 3
fi

# ── Verifica pg_restore ───────────────────────────────────────────────
if ! command -v pg_restore >/dev/null 2>&1; then
  echo "[restore_db] ERROR: pg_restore no encontrado. Instala postgresql-client." >&2
  exit 4
fi

# ── Confirmación ──────────────────────────────────────────────────────
DUMP_SIZE=$(du -h "${DUMP_FILE}" | cut -f1)
echo "[restore_db] DESTRUCTIVO."
echo "  source : ${DUMP_FILE}  (${DUMP_SIZE})"
echo "  target : ${DATABASE_URL}"
echo
echo "  Esto va a DROPEAR las tablas existentes en el target y restaurar"
echo "  el dump completo. NO se puede deshacer sin otro backup."
echo

if [[ "${NONINTERACTIVE:-0}" != "1" ]]; then
  read -r -p '  Escribe "RESTAURAR" para confirmar: ' confirm
  if [[ "${confirm}" != "RESTAURAR" ]]; then
    echo "[restore_db] cancelado por el usuario."
    exit 0
  fi
fi

echo "[restore_db] start"
gunzip -c "${DUMP_FILE}" | pg_restore \
  --dbname "${DATABASE_URL}" \
  --clean --if-exists \
  --no-owner --no-acl \
  --exit-on-error \
  --verbose 2>&1 | tail -20

echo "[restore_db] OK"
