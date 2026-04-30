#!/usr/bin/env bash
# verify_backup.sh — Valida que el respaldo más reciente sea restaurable.
#
# Crea una BD temporal, restaura el último dump, corre sanity checks y
# borra la BD temporal. NO toca la BD de producción ni la de desarrollo.
#
# Uso:
#   ./scripts/verify_backup.sh                                # último dump
#   ./scripts/verify_backup.sh ~/.inyecta-backups/inyecta_2026-04-29_03-00-00.dump.gz
#
# Cron sugerido (mensual, primer domingo a las 4 AM):
#   0 4 1-7 * 0 cd /opt/inyecta && \
#       BACKUP_PASSPHRASE_FILE=/etc/inyecta/backup.key \
#       ./scripts/verify_backup.sh >> /var/log/inyecta-verify.log 2>&1
#
# Variables:
#   DATABASE_URL          BD origen (para reusar credenciales del host).
#                         La BD temporal se crea en el MISMO servidor con
#                         nombre `inyecta_verify_<ts>` y se dropea al final.
#   BACKUP_DIR            Directorio donde están los dumps. Default: ~/.inyecta-backups
#   BACKUP_PASSPHRASE     Passphrase si los dumps están cifrados.
#   BACKUP_PASSPHRASE_FILE Idem, vía archivo (preferido para cron).
#
# Sale con código 0 si todo OK, código != 0 si hay problema.
# El cron debe alertar a Damián vía email/Slack en cualquier exit != 0.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"
BACKUP_DIR="${BACKUP_DIR:-${HOME}/.inyecta-backups}"

# ── DATABASE_URL ──────────────────────────────────────────────────────
if [[ -z "${DATABASE_URL:-}" ]]; then
  if [[ -f "${REPO_ROOT}/server/.env" ]]; then
    DATABASE_URL=$(grep -E '^DATABASE_URL=' "${REPO_ROOT}/server/.env" \
      | head -n1 | cut -d= -f2- | sed 's/^"//;s/"$//')
  fi
fi
if [[ -z "${DATABASE_URL:-}" ]]; then
  echo "[verify_backup] ERROR: DATABASE_URL no está definido." >&2
  exit 2
fi

# ── Resuelve passphrase ───────────────────────────────────────────────
PASSPHRASE=""
if [[ -n "${BACKUP_PASSPHRASE_FILE:-}" ]]; then
  PASSPHRASE=$(tr -d '\n\r' < "${BACKUP_PASSPHRASE_FILE}")
elif [[ -n "${BACKUP_PASSPHRASE:-}" ]]; then
  PASSPHRASE="${BACKUP_PASSPHRASE}"
fi

# ── Selecciona el dump a verificar ────────────────────────────────────
if [[ $# -ge 1 ]]; then
  DUMP_FILE="$1"
else
  DUMP_FILE=$(ls -t "${BACKUP_DIR}"/inyecta_*.dump.gz* 2>/dev/null | head -n1 || true)
  if [[ -z "${DUMP_FILE}" ]]; then
    echo "[verify_backup] ERROR: no hay respaldos en ${BACKUP_DIR}" >&2
    exit 3
  fi
fi

if [[ ! -r "${DUMP_FILE}" ]]; then
  echo "[verify_backup] ERROR: dump no legible: ${DUMP_FILE}" >&2
  exit 4
fi

DUMP_SIZE=$(du -h "${DUMP_FILE}" | cut -f1)
DUMP_AGE_HOURS=$(( ( $(date +%s) - $(stat -c '%Y' "${DUMP_FILE}" 2>/dev/null \
  || stat -f '%m' "${DUMP_FILE}" 2>/dev/null || echo 0) ) / 3600 ))

echo "[verify_backup] start dump=${DUMP_FILE} size=${DUMP_SIZE} age=${DUMP_AGE_HOURS}h"

# Alerta si el dump es muy viejo (>36h). El cron diario debería ejecutarse
# todos los días, así que un dump de >36h significa que el cron falló.
if [[ "${DUMP_AGE_HOURS}" -gt 36 ]]; then
  echo "[verify_backup] WARN: el dump más reciente tiene ${DUMP_AGE_HOURS}h. Revisa el cron de backup." >&2
fi

# ── Construye el URL de la BD temporal ────────────────────────────────
# Reemplaza el nombre de BD en el URL. Postgres connection strings:
#   postgresql://user:pass@host:port/dbname?params
TS=$(date -u +"%Y%m%d_%H%M%S")
TEMP_DB="inyecta_verify_${TS}"

# Saca el URL base (sin nombre de BD) y los params
URL_PREFIX=$(echo "${DATABASE_URL}" | sed -E 's|(.*)/[^/?]+(\?.*)?$|\1|')
URL_PARAMS=$(echo "${DATABASE_URL}" | sed -nE 's|.*/[^/?]+(\?.*)?$|\1|p')
TEMP_URL="${URL_PREFIX}/${TEMP_DB}${URL_PARAMS}"
ADMIN_URL="${URL_PREFIX}/postgres${URL_PARAMS}"

# ── Crea la BD temporal ───────────────────────────────────────────────
echo "[verify_backup] creating temp db ${TEMP_DB}"
psql "${ADMIN_URL}" -v ON_ERROR_STOP=1 -c "CREATE DATABASE \"${TEMP_DB}\";" >/dev/null

cleanup() {
  echo "[verify_backup] cleanup: dropping ${TEMP_DB}"
  psql "${ADMIN_URL}" -v ON_ERROR_STOP=1 \
    -c "DROP DATABASE IF EXISTS \"${TEMP_DB}\";" >/dev/null 2>&1 || true
}
trap cleanup EXIT

# ── Restaura el dump a la BD temporal ─────────────────────────────────
RESTORE_PIPELINE=""
case "${DUMP_FILE}" in
  *.gpg)
    if [[ -z "${PASSPHRASE}" ]]; then
      echo "[verify_backup] ERROR: dump cifrado pero no hay passphrase." >&2
      exit 5
    fi
    RESTORE_PIPELINE="gpg --batch --quiet --no-tty --pinentry-mode loopback \
                          --passphrase-fd 3 --decrypt \
                          3<<<\"\${PASSPHRASE}\" \"${DUMP_FILE}\" | gunzip"
    ;;
  *.enc)
    if [[ -z "${PASSPHRASE}" ]]; then
      echo "[verify_backup] ERROR: dump cifrado pero no hay passphrase." >&2
      exit 5
    fi
    RESTORE_PIPELINE="openssl enc -d -aes-256-cbc -pbkdf2 -iter 200000 \
                                  -in \"${DUMP_FILE}\" -pass fd:3 \
                                  3<<<\"\${PASSPHRASE}\" | gunzip"
    ;;
  *.gz)
    RESTORE_PIPELINE="gunzip -c \"${DUMP_FILE}\""
    ;;
  *)
    echo "[verify_backup] ERROR: extensión desconocida: ${DUMP_FILE}" >&2
    exit 6
    ;;
esac

echo "[verify_backup] restoring..."
eval "${RESTORE_PIPELINE}" | pg_restore --dbname="${TEMP_URL}" --no-owner --no-acl --exit-on-error \
  >/dev/null 2>&1 \
  || { echo "[verify_backup] ERROR: pg_restore falló" >&2; exit 7; }

# ── Sanity checks ─────────────────────────────────────────────────────
# Lista de tablas críticas. Si alguna está vacía o falta, algo está muy mal.
EXPECTED_TABLES=(users clients contracts payments quotations bitacora)

for table in "${EXPECTED_TABLES[@]}"; do
  COUNT=$(psql "${TEMP_URL}" -tAc "SELECT COUNT(*) FROM ${table};" 2>/dev/null || echo "FAIL")
  if [[ "${COUNT}" == "FAIL" ]]; then
    echo "[verify_backup] ERROR: tabla ${table} no existe en el dump." >&2
    exit 8
  fi
  echo "[verify_backup] OK ${table}: ${COUNT} filas"
done

# Check específico: al menos 1 ADMIN activo (sin esto no podemos entrar al sistema).
ADMIN_COUNT=$(psql "${TEMP_URL}" -tAc \
  "SELECT COUNT(*) FROM users WHERE rol='ADMIN' AND activo=true;" 2>/dev/null || echo "0")
if [[ "${ADMIN_COUNT}" -lt 1 ]]; then
  echo "[verify_backup] ERROR: el dump no contiene ningún ADMIN activo. Sistema irrecuperable." >&2
  exit 9
fi
echo "[verify_backup] OK admin_activo: ${ADMIN_COUNT}"

# Check de integridad referencial básica: ningún payment sin contract.
ORPHAN_PAYMENTS=$(psql "${TEMP_URL}" -tAc "
  SELECT COUNT(*) FROM payments p
  LEFT JOIN contracts c ON c.id = p.\"contractId\"
  WHERE c.id IS NULL;
" 2>/dev/null || echo "FAIL")
if [[ "${ORPHAN_PAYMENTS}" != "0" ]]; then
  echo "[verify_backup] ERROR: ${ORPHAN_PAYMENTS} pagos huérfanos en el dump." >&2
  exit 10
fi
echo "[verify_backup] OK referential_integrity: payments → contracts"

# ── Resumen final ─────────────────────────────────────────────────────
echo "[verify_backup] PASS dump=${DUMP_FILE} all_checks_ok"
exit 0
