#!/usr/bin/env bash
# Stop hook: se ejecuta cuando Claude termina de responder.
# Detecta si hubo cambios en archivos críticos y recuerda a Claude qué subagente invocar / qué tests correr.

set -uo pipefail

PROJECT_DIR="${CLAUDE_PROJECT_DIR:-$(pwd)}"
cd "$PROJECT_DIR" || exit 0

# Solo activamos si hay cambios sin commitear
if ! git -C "$PROJECT_DIR" diff --name-only HEAD 2>/dev/null | grep -q .; then
  exit 0
fi

CHANGED=$(git -C "$PROJECT_DIR" diff --name-only HEAD 2>/dev/null)

REMINDERS=()

# Cobranza / pagos
if echo "$CHANGED" | grep -qE "(cobranza|distribucion|payment)"; then
  REMINDERS+=("🛡️  Tocaste cobranza/distribución/pagos → invoca subagente cobranza-guardian antes de commit.")
fi

# Cálculo / cotizaciones
if echo "$CHANGED" | grep -qE "(leaseCalculator|calculos|cotizacion|quotations)"; then
  REMINDERS+=("🛡️  Tocaste motor de cálculo / quotations → invoca subagente quotations-guardian.")
fi

# Seguridad
if echo "$CHANGED" | grep -qE "(auth|jwtRevocation|uploadCipher|mfa|passwords|rateLimit|middleware)"; then
  REMINDERS+=("🛡️  Tocaste capa de seguridad (S1-S6) → invoca subagente security-reviewer.")
fi

# Schema / migraciones
if echo "$CHANGED" | grep -qE "(schema\.prisma|migrations/)"; then
  REMINDERS+=("⚠️  Tocaste schema/migraciones → confirma con Damián antes de aplicar (npx prisma migrate dev).")
fi

# Tests faltantes
TS_TOUCHED=$(echo "$CHANGED" | grep -E "(server|client)/src/.*\.ts$" | grep -v "__tests__" | grep -v "\.test\." || true)
if [ -n "$TS_TOUCHED" ]; then
  for f in $TS_TOUCHED; do
    base=$(basename "$f" .ts)
    dir=$(dirname "$f")
    if [ ! -f "$dir/__tests__/${base}.test.ts" ] && [ ! -f "$dir/${base}.test.ts" ]; then
      REMINDERS+=("📝 $f no tiene test correspondiente. Considera agregarlo.")
    fi
  done
fi

# Imprimir recordatorios
if [ ${#REMINDERS[@]} -gt 0 ]; then
  echo "" >&2
  echo "═══ Pre-commit checklist ═══" >&2
  for r in "${REMINDERS[@]}"; do
    echo "$r" >&2
  done
  echo "═══════════════════════════" >&2
fi

# Sugerir tests
echo "" >&2
echo "Antes de commit: cd server && npx tsc --noEmit && npm test" >&2
echo "                cd client && npx tsc -b && npm test" >&2

exit 0
