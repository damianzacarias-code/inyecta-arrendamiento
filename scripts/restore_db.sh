#!/usr/bin/env bash
# restore_db.sh — Restaura un dump generado por backup_db.sh.
#
# Uso:
#   ./scripts/restore_db.sh ~/.inyecta-backups/inyecta_2026-04-21_03-15-00.dump.gz
#   ./scripts/restore_db.sh ~/.inyecta-backups/inyecta_*.dump.gz.gpg
#   DATABASE_URL=postgresql://... ./scripts/restore_db.sh <dump>
#   BACKUP_PASSPHRASE='...' ./scripts/restore_db.sh <dump.gpg>
#   BACKUP_PASSPHRASE_FILE=/etc/inyecta/backup.key ./scripts/restore_db.sh <dump.gpg>
#
# DESTRUCTIVO: dropea y recrea las tablas del schema. Pide confirmación
# explícita antes de hacer nada.
#
# Detecta automáticamente si el archivo está cifrado:
#   .dump.gz       → solo gunzip
#   .dump.gz.gpg   → gpg --decrypt → gunzip
#   .dump.gz.enc   → openssl enc -d → gunzip

set -euo pipefail

if [[ $# -lt 1 ]]; then
  echo "Uso: $0 <archivo.dump.gz[.gpg|.enc]>" >&2
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

# ── pg_restore ────────────────────────────────────────────────────────
if ! command -v pg_restore >/dev/null 2>&1; then
  echo "[restore_db] ERROR: pg_restore no encontrado. Instala postgresql-client." >&2
  exit 4
fi

# ── Detección de cifrado + passphrase ─────────────────────────────────
ENCRYPT_TOOL="none"
case "${DUMP_FILE}" in
  *.dump.gz.gpg) ENCRYPT_TOOL="gpg"     ;;
  *.dump.gz.enc) ENCRYPT_TOOL="openssl" ;;
  *.dump.gz)     ENCRYPT_TOOL="none"    ;;
  *)
    echo "[restore_db] ERROR: extensión no reconocida: ${DUMP_FILE}" >&2
    echo "             Esperado: .dump.gz, .dump.gz.gpg o .dump.gz.enc" >&2
    exit 9
    ;;
esac

PASSPHRASE=""
if [[ "${ENCRYPT_TOOL}" != "none" ]]; then
  if [[ -n "${BACKUP_PASSPHRASE_FILE:-}" ]]; then
    if [[ ! -r "${BACKUP_PASSPHRASE_FILE}" ]]; then
      echo "[restore_db] ERROR: BACKUP_PASSPHRASE_FILE no es legible." >&2
      exit 10
    fi
    PASSPHRASE=$(tr -d '\n\r' < "${BACKUP_PASSPHRASE_FILE}")
  elif [[ -n "${BACKUP_PASSPHRASE:-}" ]]; then
    PASSPHRASE="${BACKUP_PASSPHRASE}"
  else
    echo "[restore_db] ERROR: el archivo está cifrado (${ENCRYPT_TOOL}) " \
         "pero no hay BACKUP_PASSPHRASE ni BACKUP_PASSPHRASE_FILE." >&2
    exit 11
  fi

  # Validar herramienta disponible.
  if [[ "${ENCRYPT_TOOL}" == "gpg" ]] && ! command -v gpg >/dev/null 2>&1; then
    echo "[restore_db] ERROR: archivo .gpg pero gpg no está instalado." >&2
    exit 12
  fi
  if [[ "${ENCRYPT_TOOL}" == "openssl" ]] && ! command -v openssl >/dev/null 2>&1; then
    echo "[restore_db] ERROR: archivo .enc pero openssl no está instalado." >&2
    exit 13
  fi
fi

# ── Confirmación ──────────────────────────────────────────────────────
DUMP_SIZE=$(du -h "${DUMP_FILE}" | cut -f1)
echo "[restore_db] DESTRUCTIVO."
echo "  source : ${DUMP_FILE}  (${DUMP_SIZE}, encrypt=${ENCRYPT_TOOL})"
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

# ── Pipe: descifrar (si aplica) → gunzip → pg_restore ─────────────────
case "${ENCRYPT_TOOL}" in
  gpg)
    gpg --batch --quiet --no-tty \
        --pinentry-mode loopback \
        --passphrase-fd 3 \
        --decrypt "${DUMP_FILE}" \
        3<<<"${PASSPHRASE}" \
      | gunzip -c \
      | pg_restore \
          --dbname "${DATABASE_URL}" \
          --clean --if-exists \
          --no-owner --no-acl \
          --exit-on-error \
          --verbose 2>&1 | tail -20
    ;;
  openssl)
    openssl enc -d -aes-256-cbc -pbkdf2 -iter 200000 \
            -in "${DUMP_FILE}" \
            -pass fd:3 \
            3<<<"${PASSPHRASE}" \
      | gunzip -c \
      | pg_restore \
          --dbname "${DATABASE_URL}" \
          --clean --if-exists \
          --no-owner --no-acl \
          --exit-on-error \
          --verbose 2>&1 | tail -20
    ;;
  none)
    gunzip -c "${DUMP_FILE}" \
      | pg_restore \
          --dbname "${DATABASE_URL}" \
          --clean --if-exists \
          --no-owner --no-acl \
          --exit-on-error \
          --verbose 2>&1 | tail -20
    ;;
esac

echo "[restore_db] OK"
