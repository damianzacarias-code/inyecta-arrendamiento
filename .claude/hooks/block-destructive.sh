#!/usr/bin/env bash
# PreToolUse hook for Bash
# Bloquea comandos destructivos. Damián los ejecuta a mano si los necesita.

set -euo pipefail

INPUT=$(cat)
CMD=$(echo "$INPUT" | jq -r '.tool_input.command // ""')

# Lista de patrones bloqueados con explicación
declare -a BLOCKED=(
  'git push --force|git push -f|--force-with-lease=*||Force push: pídelo a Damián.'
  'prisma migrate reset|prisma migrate resolve --rolled-back||Reset/rollback de migraciones: lo hace Damián.'
  'DROP TABLE|DROP DATABASE|TRUNCATE TABLE||Operación destructiva en BD: pídelo a Damián.'
  'rm -rf /|rm -rf ~|rm -rf \$HOME||rm -rf en raíz/home: prohibido.'
  'sudo ||Comandos con sudo: no.'
  'chmod 777|chmod -R 777||chmod 777: nunca.'
  'curl .*\| *(ba)?sh|wget .*\| *(ba)?sh||Pipe a shell desde curl/wget: nunca.'
)

for entry in "${BLOCKED[@]}"; do
  pattern="${entry%%||*}"
  message="${entry##*||}"
  if echo "$CMD" | grep -qE "$pattern"; then
    echo "🛑 Comando bloqueado: $CMD" >&2
    echo "   $message" >&2
    exit 2
  fi
done

exit 0
