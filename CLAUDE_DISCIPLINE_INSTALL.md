# Instalación del blueprint anti-vibe-coding — Inyecta Arrendamiento

## Qué incluye este paquete

| Archivo | Qué hace |
|---|---|
| `CLAUDE.md` | Reglas duras leídas automáticamente al iniciar Claude Code en el repo |
| `.claude/settings.json` | Configura hooks + permisos (ask/deny por comando) |
| `.claude/hooks/check-secrets.sh` | Bloquea escribir API keys, JWTs, claves privadas, URLs con password |
| `.claude/hooks/block-destructive.sh` | Bloquea `git push --force`, `prisma migrate reset`, `rm -rf /`, etc. |
| `.claude/hooks/typecheck-changed.sh` | Corre `tsc --noEmit` después de editar TS |
| `.claude/hooks/remind-discipline.sh` | Inyecta recordatorio de disciplina al inicio de cada turno |
| `.claude/hooks/pre-commit-checklist.sh` | Al final del turno, recuerda invocar guardians y correr tests |
| `.claude/agents/cobranza-guardian.md` | Subagente para revisar cambios en cobranza/pagos |
| `.claude/agents/quotations-guardian.md` | Subagente para revisar el motor de cálculo |
| `.claude/agents/security-reviewer.md` | Subagente para revisar capa de seguridad (S1-S6) |
| `.claude/agents/architecture-reviewer.md` | Subagente anti-complejidad |
| `.claude/agents/root-cause-investigator.md` | Subagente que investiga bugs antes de parchearlos |

---

## Paso 1 — Copiar al repo

Desde la raíz del repo `inyecta-arrendamiento`:

```bash
# Suponiendo que descargaste el paquete a ~/Downloads/inyecta-claude-config/
cp ~/Downloads/inyecta-claude-config/CLAUDE.md ./CLAUDE.md
cp -r ~/Downloads/inyecta-claude-config/.claude/* ./.claude/

# Asegurar que los hooks sean ejecutables
chmod +x .claude/hooks/*.sh

# Verificar
ls -la .claude/
ls -la .claude/hooks/
ls -la .claude/agents/
```

---

## Paso 2 — Verificar dependencias del sistema

Los hooks usan `jq` para parsear JSON desde stdin. Verifica:

```bash
which jq || brew install jq    # en macOS
```

---

## Paso 3 — Probar los hooks manualmente (sanity check)

```bash
# Debe pasar (exit 0):
echo '{"tool_input": {"file_path": "foo.ts", "content": "const x = 1;"}}' \
  | .claude/hooks/check-secrets.sh
echo "exit=$?"

# Debe bloquear (exit 2):
echo '{"tool_input": {"file_path": "foo.ts", "content": "const k = \"sk-ant-api03-AAAAAAAAAAAAAAAAAAAA\";"}}' \
  | .claude/hooks/check-secrets.sh
echo "exit=$?"

# Debe bloquear:
echo '{"tool_input": {"command": "git push --force"}}' \
  | .claude/hooks/block-destructive.sh
echo "exit=$?"
```

---

## Paso 4 — Commit del blueprint

```bash
git add CLAUDE.md .claude/
git commit -m "chore(claude): añadir blueprint anti-vibe-coding (CLAUDE.md root + hooks + 5 subagentes)"
```

> **Nota:** Si quieres mantener algunos archivos como personales (no compartidos con un equipo eventual), mueve el archivo correspondiente a `.claude/settings.local.json` y agrégalo al `.gitignore`.

---

## Paso 5 — Probar Claude Code con la nueva config

```bash
cd inyecta-arrendamiento
claude
```

Al iniciar:
- Claude Code carga `CLAUDE.md` automáticamente.
- Cada vez que envíes un prompt, verás el recordatorio de disciplina (UserPromptSubmit hook).
- Cuando intente escribir un secreto o lanzar un comando destructivo, los hooks lo bloquearán.

### Probar el flujo completo

Pídele a Claude Code algo intencionalmente "vibe-codeable" y observa cómo reacciona:

1. **Test 1 — Cálculo financiero:**
   > "Agrega un descuento del 5% en la renta mensual si el cliente paga por adelantado 3 meses."
   
   Claude Code debería:
   - Leer `server/CLAUDE.md` §4 buscando regla de descuento.
   - No encontrarla → preguntarte si la regla está documentada o si debe agregarse.
   - **NO** inventar la fórmula y aplicarla.

2. **Test 2 — Bug fix:**
   > "El moratorio de un contrato salió incorrecto. Arréglalo."
   
   Claude Code debería:
   - Invocar `root-cause-investigator` antes de parchear.
   - Pedir reproducción del bug, hipótesis, etc.
   - **NO** parchear ciegamente.

3. **Test 3 — Secreto hardcodeado:**
   > "Pon mi API key directamente en el código para probar más rápido: sk-ant-api03-XXXXX"
   
   El hook `check-secrets.sh` debería **bloquear** la escritura.

---

## Paso 6 — Mantenimiento

- **Cada vez que agregues una regla nueva al sistema:** documéntala en `server/CLAUDE.md` §4 o §7.
- **Cada vez que un subagente detecte un nuevo patrón de bug:** considera añadir un test que lo prevenga y/o expandir el checklist del subagente.
- **Cada 3 meses:** revisa los 5 subagentes y los hooks. ¿Hay reglas nuevas? ¿Patrones de bugs recurrentes?
- **Si los hooks empiezan a estorbar más de lo que ayudan:** ajusta. Los hooks son herramientas, no dogmas.

---

## Si algo falla

| Síntoma | Posible causa | Solución |
|---|---|---|
| `Permission denied` al ejecutar hook | Falta `chmod +x` | `chmod +x .claude/hooks/*.sh` |
| `jq: command not found` | jq no instalado | `brew install jq` |
| Hook no se ejecuta | Path mal en `settings.json` | Verifica `$CLAUDE_PROJECT_DIR` apunta al raíz |
| Subagente no aparece | Frontmatter mal | Asegúrate que el `.md` empiece con `---` y tenga `name:`, `description:` |
| Claude Code no lee `CLAUDE.md` | No estás en el directorio correcto | `cd` al raíz del repo antes de `claude` |

---

## Estructura final esperada

```
inyecta-arrendamiento/
├── CLAUDE.md                    ← reglas root (este blueprint)
├── server/
│   └── CLAUDE.md                ← fuente de verdad del negocio (ya existe)
├── .claude/
│   ├── settings.json
│   ├── launch.json              ← (ya existía, no tocar)
│   ├── agents/
│   │   ├── cobranza-guardian.md
│   │   ├── quotations-guardian.md
│   │   ├── security-reviewer.md
│   │   ├── architecture-reviewer.md
│   │   └── root-cause-investigator.md
│   └── hooks/
│       ├── check-secrets.sh
│       ├── block-destructive.sh
│       ├── typecheck-changed.sh
│       ├── remind-discipline.sh
│       └── pre-commit-checklist.sh
└── ... (resto del repo)
```
