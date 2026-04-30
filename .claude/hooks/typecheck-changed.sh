#!/usr/bin/env bash
# PostToolUse hook para Write/Edit/MultiEdit.
# Si el archivo tocado es .ts/.tsx, corre tsc --noEmit en server o client según corresponda.
# Reporta errores via stderr para que Claude los vea, pero no bloquea (exit 0 siempre).

set -uo pipefail

INPUT=$(cat)
FILE=$(echo "$INPUT" | jq -r '.tool_input.file_path // ""')

# Solo nos interesa TS/TSX
case "$FILE" in
  *.ts|*.tsx) ;;
  *) exit 0 ;;
esac

# Si toca tests, también corremos los tests del archivo
PROJECT_DIR="${CLAUDE_PROJECT_DIR:-$(pwd)}"

# Determinar si el archivo es server o client
if [[ "$FILE" == *"/server/"* ]]; then
  TARGET="$PROJECT_DIR/server"
  CMD="cd $TARGET && npx tsc --noEmit 2>&1 | tail -20"
elif [[ "$FILE" == *"/client/"* ]]; then
  TARGET="$PROJECT_DIR/client"
  CMD="cd $TARGET && npx tsc -b 2>&1 | tail -20"
else
  exit 0
fi

# Ejecutar typecheck
OUTPUT=$(eval "$CMD" 2>&1) || true

# Si hay errores, reportarlos
if echo "$OUTPUT" | grep -qE "(error TS|error  TS)"; then
  echo "⚠️  TypeScript errors después de editar $FILE:" >&2
  echo "$OUTPUT" >&2
  echo "" >&2
  echo "Arregla los errores de tipos antes de continuar." >&2
fi

exit 0
