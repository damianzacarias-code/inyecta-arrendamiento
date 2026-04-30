#!/usr/bin/env bash
# PreToolUse hook for Write/Edit/MultiEdit
# Bloquea escritura de secretos hardcodeados.
# Lee tool_input desde stdin (JSON) y aborta con exit 2 si detecta patrón sospechoso.

set -euo pipefail

INPUT=$(cat)
# Extrae el contenido que se va a escribir/editar
CONTENT=$(echo "$INPUT" | jq -r '
  .tool_input.content // .tool_input.new_string // (.tool_input.edits // [] | map(.new_string) | join("\n")) // ""
')
FILE=$(echo "$INPUT" | jq -r '.tool_input.file_path // ""')

# Patrones de secretos comunes
PATTERNS=(
  'sk-ant-[a-zA-Z0-9_-]{20,}'                   # Anthropic API key
  'sk-[a-zA-Z0-9]{40,}'                         # OpenAI / generic
  'AIza[0-9A-Za-z_-]{35}'                       # Google
  'AKIA[0-9A-Z]{16}'                            # AWS Access Key ID
  'eyJ[A-Za-z0-9_-]+\.eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+' # JWT con payload
  'postgres://[^:]+:[^@]+@'                     # Postgres con password embebido
  'mongodb\+srv://[^:]+:[^@]+@'                 # Mongo con password embebido
  'mysql://[^:]+:[^@]+@'                        # MySQL con password embebido
  '-----BEGIN (RSA |EC |OPENSSH |)PRIVATE KEY-----' # Llaves privadas
)

# Excepciones: archivos donde sí pueden vivir secretos como referencia (.env.example, docs)
case "$FILE" in
  *.env.example|*.env.prod.example|*/docs/*|*/CLAUDE.md|*/README.md)
    exit 0
    ;;
esac

for pat in "${PATTERNS[@]}"; do
  if echo "$CONTENT" | grep -qE -e "$pat"; then
    echo "🛑 Bloqueado: posible secreto hardcodeado en $FILE" >&2
    echo "   Patrón detectado: $pat" >&2
    echo "   Mueve el secreto a server/.env y léelo via server/src/config/env.ts" >&2
    exit 2
  fi
done

# Variables hardcoded que típicamente deberían venir de env
if echo "$CONTENT" | grep -qE '(JWT_SECRET|DATABASE_URL|ANTHROPIC_API_KEY|SMTP_PASS|REFRESH_SECRET)\s*=\s*["'"'"'][^"'"'"' $]+["'"'"']'; then
  echo "🛑 Bloqueado: variable de configuración hardcodeada en $FILE" >&2
  echo "   Las claves van en server/.env, no en código." >&2
  exit 2
fi

exit 0
