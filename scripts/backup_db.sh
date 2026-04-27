#!/usr/bin/env bash
# backup_db.sh — Dump comprimido (y opcionalmente cifrado) de Postgres
# con rotación automática.
#
# Uso:
#   ./scripts/backup_db.sh                                    # usa server/.env
#   DATABASE_URL=postgresql://... ./scripts/backup_db.sh
#   BACKUP_DIR=/mnt/backups RETENTION_DAYS=90 ./scripts/backup_db.sh
#   BACKUP_PASSPHRASE='...' ./scripts/backup_db.sh            # cifra con GPG/OpenSSL
#
# Cron sugerido (diario 03:00 AM):
#   0 3 * * * cd /opt/inyecta && BACKUP_PASSPHRASE_FILE=/etc/inyecta/backup.key \
#             ./scripts/backup_db.sh >> /var/log/inyecta-backup.log 2>&1
#
# Variables:
#   DATABASE_URL          PostgreSQL conn string. Si no está, lee de server/.env.
#   BACKUP_DIR            Destino de los dumps. Default: ~/.inyecta-backups
#   RETENTION_DAYS        Días de retención. Default: 30.
#   BACKUP_PASSPHRASE     Passphrase para cifrar el dump. Si está, el archivo
#                         queda cifrado (extensión .gpg o .enc). Si no, queda
#                         como .gz en claro (dev / staging únicamente).
#   BACKUP_PASSPHRASE_FILE Alternativa a BACKUP_PASSPHRASE — ruta a un archivo
#                         con la passphrase (precedencia: file > var > vacío).
#                         Recomendado para cron: el ENV puede leakearse a
#                         /proc; un archivo con permisos 600 es más seguro.
#   BACKUP_ENCRYPT        force=fuerza GPG/OpenSSL aunque no haya passphrase
#                         (aborta), off=NUNCA cifra (override de seguridad).
#                         Default auto: cifra si hay passphrase.
#
# Comportamiento:
#   • Lee DATABASE_URL del entorno; si no, lo extrae de server/.env.
#   • Genera dump con `pg_dump --format=custom`.
#   • Comprime con gzip (-9) y le pone timestamp UTC.
#   • Si hay passphrase + gpg disponible → AES-256 simétrico con
#     PBKDF2-SHA512 + salt aleatorio (gpg --symmetric).
#   • Si no hay gpg → fallback a `openssl enc -aes-256-cbc -pbkdf2 -iter 200000`.
#   • En production (NODE_ENV=production), exige cifrado: si no hay
#     passphrase aborta para no dejar dumps en claro.
#   • Borra dumps más viejos que RETENTION_DAYS.
#   • Sale con código != 0 si algo falla → el cron loggea el error.

set -euo pipefail

# ── Config ────────────────────────────────────────────────────────────
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"
BACKUP_DIR="${BACKUP_DIR:-${HOME}/.inyecta-backups}"
RETENTION_DAYS="${RETENTION_DAYS:-30}"
NODE_ENV="${NODE_ENV:-development}"

# ── DATABASE_URL ──────────────────────────────────────────────────────
if [[ -z "${DATABASE_URL:-}" ]]; then
  if [[ -f "${REPO_ROOT}/server/.env" ]]; then
    DATABASE_URL=$(grep -E '^DATABASE_URL=' "${REPO_ROOT}/server/.env" \
      | head -n1 | cut -d= -f2- | sed 's/^"//;s/"$//')
  fi
fi
if [[ -z "${DATABASE_URL:-}" ]]; then
  echo "[backup_db] ERROR: DATABASE_URL no está definido y server/.env no existe o no lo contiene." >&2
  exit 2
fi

# ── pg_dump ───────────────────────────────────────────────────────────
if ! command -v pg_dump >/dev/null 2>&1; then
  echo "[backup_db] ERROR: pg_dump no encontrado en PATH. Instala postgresql-client." >&2
  exit 3
fi

# ── Resuelve passphrase + decide modo de cifrado ──────────────────────
PASSPHRASE=""
if [[ -n "${BACKUP_PASSPHRASE_FILE:-}" ]]; then
  if [[ ! -r "${BACKUP_PASSPHRASE_FILE}" ]]; then
    echo "[backup_db] ERROR: BACKUP_PASSPHRASE_FILE=${BACKUP_PASSPHRASE_FILE} no es legible." >&2
    exit 5
  fi
  # Permisos del archivo: si es 644 o más permisivo, warn (debería ser 600).
  if command -v stat >/dev/null 2>&1; then
    PERM=$(stat -c '%a' "${BACKUP_PASSPHRASE_FILE}" 2>/dev/null \
        || stat -f '%Lp' "${BACKUP_PASSPHRASE_FILE}" 2>/dev/null || echo "?")
    if [[ "${PERM}" != "?" && "${PERM}" -gt 600 ]]; then
      echo "[backup_db] WARN: BACKUP_PASSPHRASE_FILE tiene permisos ${PERM} (recomendado 600)." >&2
    fi
  fi
  # Lee con tr para quitar el newline final (gpg/openssl son sensibles).
  PASSPHRASE=$(tr -d '\n\r' < "${BACKUP_PASSPHRASE_FILE}")
elif [[ -n "${BACKUP_PASSPHRASE:-}" ]]; then
  PASSPHRASE="${BACKUP_PASSPHRASE}"
fi

ENCRYPT_MODE="${BACKUP_ENCRYPT:-auto}"
if [[ "${ENCRYPT_MODE}" == "off" ]]; then
  PASSPHRASE=""
fi

# Production: cifrado obligatorio. Cualquier dump en claro es una fuga
# de PII regulada (CNBV/CONDUSEF). Si BACKUP_ENCRYPT=off lo permites
# explícitamente (caso: pipeline que cifra después con KMS).
if [[ "${NODE_ENV}" == "production" && -z "${PASSPHRASE}" && "${ENCRYPT_MODE}" != "off" ]]; then
  echo "[backup_db] ERROR: en production requiero BACKUP_PASSPHRASE o BACKUP_PASSPHRASE_FILE." >&2
  echo "             Para forzar dump en claro (no recomendado): BACKUP_ENCRYPT=off." >&2
  exit 6
fi

# Modo force: explícito desde el caller.
if [[ "${ENCRYPT_MODE}" == "force" && -z "${PASSPHRASE}" ]]; then
  echo "[backup_db] ERROR: BACKUP_ENCRYPT=force pero no hay BACKUP_PASSPHRASE." >&2
  exit 7
fi

# Decide herramienta de cifrado (preferencia: gpg > openssl > ninguna).
ENCRYPT_TOOL=""
ENCRYPT_EXT=""
if [[ -n "${PASSPHRASE}" ]]; then
  if command -v gpg >/dev/null 2>&1; then
    ENCRYPT_TOOL="gpg"
    ENCRYPT_EXT=".gpg"
  elif command -v openssl >/dev/null 2>&1; then
    ENCRYPT_TOOL="openssl"
    ENCRYPT_EXT=".enc"
  else
    echo "[backup_db] ERROR: hay BACKUP_PASSPHRASE pero ni gpg ni openssl están instalados." >&2
    exit 8
  fi
fi

# ── Prepara destino ───────────────────────────────────────────────────
mkdir -p "${BACKUP_DIR}"
chmod 700 "${BACKUP_DIR}" 2>/dev/null || true   # carpeta privada
TIMESTAMP=$(date -u +"%Y-%m-%d_%H-%M-%S")
DUMP_FILE="${BACKUP_DIR}/inyecta_${TIMESTAMP}.dump.gz${ENCRYPT_EXT}"
TMP_FILE="${DUMP_FILE}.tmp"

echo "[backup_db] start ts=${TIMESTAMP} dir=${BACKUP_DIR} encrypt=${ENCRYPT_TOOL:-none}"

# ── Dump → gzip → (cifrado opt) → archivo final ───────────────────────
# Pipe directo: nunca dejamos el dump sin comprimir/cifrar en disco.
# Si pg_dump falla, set -o pipefail propaga el error y borramos el .tmp.
trap 'rm -f "${TMP_FILE}"' EXIT

case "${ENCRYPT_TOOL}" in
  gpg)
    # AES-256 + SHA-512 + S2K iter alto. La passphrase entra por stdin
    # (--passphrase-fd 0) para no tocar argv ni archivos temporales.
    pg_dump --format=custom --no-owner --no-acl --compress=0 "${DATABASE_URL}" \
      | gzip -9 \
      | gpg --batch --yes --quiet --no-tty \
            --pinentry-mode loopback \
            --symmetric \
            --cipher-algo AES256 \
            --digest-algo SHA512 \
            --s2k-mode 3 --s2k-count 65011712 \
            --passphrase-fd 0 \
            --output "${TMP_FILE}" \
            <(printf '%s' "${PASSPHRASE}") \
      || { echo "[backup_db] ERROR: gpg falló" >&2; exit 10; }
    ;;
  openssl)
    # AES-256-CBC + PBKDF2 200k iter (NIST recomienda ≥10k; 200k da ~70ms
    # por intento, suficiente para frenar fuerza bruta offline).
    # -pass fd:3 lee del FD 3 que abrimos vía heredoc (no toca argv).
    pg_dump --format=custom --no-owner --no-acl --compress=0 "${DATABASE_URL}" \
      | gzip -9 \
      | openssl enc -aes-256-cbc -pbkdf2 -iter 200000 -salt \
                -pass fd:3 \
                -out "${TMP_FILE}" \
        3<<<"${PASSPHRASE}" \
      || { echo "[backup_db] ERROR: openssl enc falló" >&2; exit 11; }
    ;;
  *)
    # Sin cifrado (dev/staging). Misma cadena, sin paso final.
    pg_dump --format=custom --no-owner --no-acl --compress=0 "${DATABASE_URL}" \
      | gzip -9 > "${TMP_FILE}"
    ;;
esac

# Sanity check: el archivo final debe tener tamaño > 0.
if [[ ! -s "${TMP_FILE}" ]]; then
  echo "[backup_db] ERROR: dump quedó vacío. Abortando." >&2
  exit 4
fi

mv "${TMP_FILE}" "${DUMP_FILE}"
chmod 600 "${DUMP_FILE}" 2>/dev/null || true
trap - EXIT

DUMP_SIZE=$(du -h "${DUMP_FILE}" | cut -f1)
echo "[backup_db] OK file=${DUMP_FILE} size=${DUMP_SIZE} encrypt=${ENCRYPT_TOOL:-none}"

# ── Rotación: borra dumps > RETENTION_DAYS ────────────────────────────
# Patrón cubre tanto cifrados como en claro (.dump.gz, .dump.gz.gpg, .dump.gz.enc).
DELETED=$(find "${BACKUP_DIR}" -maxdepth 1 -type f \
  \( -name 'inyecta_*.dump.gz' -o -name 'inyecta_*.dump.gz.gpg' -o -name 'inyecta_*.dump.gz.enc' \) \
  -mtime +"${RETENTION_DAYS}" -print -delete | wc -l | tr -d ' ')
echo "[backup_db] retention=${RETENTION_DAYS}d deleted=${DELETED}"

# ── Resumen final ─────────────────────────────────────────────────────
TOTAL=$(find "${BACKUP_DIR}" -maxdepth 1 -type f \
  \( -name 'inyecta_*.dump.gz' -o -name 'inyecta_*.dump.gz.gpg' -o -name 'inyecta_*.dump.gz.enc' \) \
  | wc -l | tr -d ' ')
echo "[backup_db] done total_backups=${TOTAL}"
