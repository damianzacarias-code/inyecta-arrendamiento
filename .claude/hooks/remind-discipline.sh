#!/usr/bin/env bash
# UserPromptSubmit hook: añade un recordatorio breve al contexto antes de que Claude responda.
# El stdout aquí se inyecta como contexto adicional.

cat << 'REMINDER'
🧭 Recordatorio de disciplina (CLAUDE.md root):
1. Antes de tocar cálculos: verifica server/CLAUDE.md §4 y §7. Decimal.js obligatorio.
2. Si tocas cobranza/quotations/auth: invoca al subagente correspondiente antes de cerrar.
3. Bug → causa raíz primero, no parche al síntoma.
4. Default: solución más simple que pasa los tests.
5. Antes de "listo": tsc --noEmit + vitest run en lo que tocaste.
6. Si dudas: pregunta a Damián. No inventes fórmulas.
REMINDER

exit 0
