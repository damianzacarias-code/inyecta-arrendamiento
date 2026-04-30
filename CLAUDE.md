# Inyecta Arrendamiento — Reglas para Claude Code

> Este archivo es leído automáticamente por Claude Code al iniciar sesión en el monorepo.
> La fuente de verdad del negocio es **`server/CLAUDE.md`** (~2,564 líneas).
> Este archivo añade disciplina de ingeniería; el de `server/` añade reglas de negocio.

---

## 0. Antes de hacer cualquier cosa

1. **Lee `server/CLAUDE.md` completo** si no lo has leído en esta sesión. En particular:
   - §4 (fórmulas financieras) — son verificadas al centavo contra Excel oficial.
   - §7 (reglas no-negociables) — Decimal.js obligatorio, FV correcto por producto, etc.
   - §10 (estado actual del proyecto) — para no repetir trabajo terminado.
   - §11 (pendientes Fase Roles) — no implementar sin instrucción explícita.

2. **Confirma en 3-5 líneas qué entendiste** y qué archivos vas a tocar antes de escribir código. Si la tarea toca >1 archivo o >30 líneas, presenta un plan corto y **espera confirmación de Damián**.

3. **Si encuentras una contradicción entre código y `server/CLAUDE.md`**, el `CLAUDE.md` gana (regla §12.5 del doc maestro). Si crees que el doc está desactualizado, dilo explícitamente y propón el cambio — no lo modifiques en silencio.

---

## 1. Las 10 reglas duras (no las rompas)

### Reglas de negocio (cálculos)

1. **Nunca inventes una fórmula financiera.** Si la regla no está en `server/CLAUDE.md` §4 o §7, **pregunta a Damián** antes de escribir código. Las fórmulas son verificadas al centavo contra Excel oficial — un error aquí es dinero real.

2. **Decimal.js obligatorio** en cualquier cálculo monetario, de tasa o de IVA. Nunca uses `number` de JavaScript para dinero. Si lees código que usa `number` en un contexto financiero, márcalo como bug.

3. **Cualquier cambio que toque dinero, fechas o intereses requiere test primero.** Escribe el test que demuestre el comportamiento esperado **antes** de tocar el cálculo. Esto aplica a `leaseCalculator.ts`, `calculos.ts`, `cobranza.ts`, `distribucion.ts`.

### Causa raíz, no parches

4. **Cuando aparece un bug, identifica la causa raíz antes de parchear.** Documenta en el commit:
   - **Síntoma:** qué se ve mal.
   - **Causa raíz:** por qué pasa.
   - **Fix:** qué se cambió y por qué resuelve la causa, no solo el síntoma.
   Si parchas un síntoma sin entender la causa, decláralo explícitamente como hotfix temporal y abre TODO con la causa raíz pendiente.

5. **Default: la solución más simple que pasa los tests.** Si tu solución agrega abstracciones, capas, helpers, factories, o "por si acaso en el futuro", justifícalas explícitamente. La complejidad acumulada es la trampa más cara — la del video que motivó este blueprint.

### Seguridad

6. **Cero secretos hardcodeados.** Las claves van en variables de entorno (`server/.env`) y se acceden vía `server/src/config/env.ts`. Si ves una clave, token, password, o URL con credenciales en el código, es bug.

7. **Antes de tocar `server/src/middleware/auth.ts`, `server/src/lib/jwtRevocation.ts`, `server/src/lib/uploadCipher.ts`, `server/src/lib/mfa.ts`, `server/src/lib/passwords.ts`, o `server/src/middleware/rateLimit.ts`**, invoca al subagente `security-reviewer`. Estos archivos son el bloque S1-S6 — un error abre vulnerabilidades.

### Dependencias y costo

8. **Nunca agregues una dependencia sin justificarla.** Antes de `npm install <paquete>`:
   - Explica qué problema resuelve.
   - Verifica si ya hay algo en el stack actual que lo resuelva (`zod`, `decimal.js`, `date-fns`, `pino`, etc.).
   - Verifica licencia, peso (bundle impact en cliente), y mantenimiento (último commit < 12 meses).
   - Espera confirmación de Damián antes de instalar.

### Tests y CI

9. **Antes de decir "listo":**
   - `cd server && npx tsc --noEmit` debe pasar limpio.
   - `cd client && npx tsc -b` debe pasar limpio.
   - Los tests de los archivos que tocaste deben pasar (`vitest run <ruta>`).
   - Si tocaste `cobranza.ts` o `quotations.ts` o motor de cálculo, **debes** haber escrito tests nuevos.

10. **No `git push`, no `git push --force`, no `prisma migrate reset`, no `DROP TABLE`, no `rm -rf` fuera de `node_modules` o `dist`.** Esos los hace Damián. Si necesitas hacer un destructivo, pídelo explícitamente.

---

## 2. Subagentes obligatorios por dominio

Antes de cerrar una tarea que tocó alguno de estos archivos, **debes** invocar al subagente correspondiente para que haga revisión independiente:

| Si tocas... | Invoca subagente |
|---|---|
| `server/src/routes/cobranza.ts`, `server/src/services/distribucion.ts`, lógica de pagos/moratorios | `cobranza-guardian` |
| `server/src/services/leaseCalculator.ts`, `client/src/lib/cotizacion/calculos.ts`, fórmulas financieras | `quotations-guardian` |
| `server/src/middleware/auth.ts`, `server/src/lib/jwtRevocation.ts`, `server/src/lib/uploadCipher.ts`, `server/src/lib/mfa.ts`, `server/src/lib/passwords.ts`, rate limiting | `security-reviewer` |
| Cualquier feature nueva que cruce >2 capas (route + service + schema + UI) | `architecture-reviewer` |
| Cualquier bug reportado | `root-cause-investigator` (antes de parchear) |

Los subagentes están en `.claude/agents/`. Cada uno lee su propia versión del problema y reporta hallazgos. **No los ignores.** Si el subagente reporta un problema que decides no arreglar, documenta por qué.

---

## 3. Disciplina de commits

Formato: `<tipo>(<bloque>): <qué hiciste>`

- **tipo:** `feat`, `fix`, `refactor`, `test`, `docs`, `chore`, `security`
- **bloque:** opcional, alineado con `server/CLAUDE.md` (T1, S5, H1, etc.) o módulo (`cobranza`, `quotations`, `auth`).

Ejemplos:
- `fix(cobranza): atomicidad en POST /pagar — root cause: dos lectores ven mismo saldo`
- `test(quotations): cobertura para validación de aporteInicialPct`
- `feat(B5): pantalla de conciliación bancaria`

Cuerpo del commit (cuando aplique): explica **causa raíz** y **fix** por separado.

---

## 4. Workflow recomendado

1. **Plan**: lee `server/CLAUDE.md` + archivos involucrados → describe en 3-5 líneas qué vas a hacer y qué archivos tocas → espera confirmación.
2. **Test primero** (si aplica): escribe el test que demuestre el comportamiento esperado.
3. **Implementa**: la solución más simple que pasa el test.
4. **Verifica**:
   - `npx tsc --noEmit` (en el módulo afectado).
   - `vitest run <archivos>` (tests del módulo).
5. **Revisa con subagente**: invoca al guardian del dominio.
6. **Commit**: con formato disciplinado, causa raíz documentada si es fix.
7. **Reporta a Damián**: qué hiciste, qué tests pasan, qué quedó pendiente.

---

## 5. Si tienes dudas — pregunta

Damián prefiere que preguntes antes de inventar. Si:
- Una fórmula no está en `server/CLAUDE.md`,
- Una regla de negocio es ambigua,
- Una dependencia parece útil pero no es obvia,
- No sabes si una optimización vale la complejidad,

**pregunta**. Una pregunta cuesta minutos; un sistema mal diseñado cuesta meses.

---

## 6. Archivos relacionados

- `server/CLAUDE.md` — fuente de verdad del negocio (fórmulas, reglas, historial).
- `.claude/settings.json` — hooks que se ejecutan en cada acción de Claude Code.
- `.claude/hooks/` — scripts de hooks (secretos, typecheck, tests).
- `.claude/agents/` — subagentes especializados.
- `docs/LOGICA_COBRANZA.md` — detalle de prelación legal y cobranza.
- `nocturna_2026-04-23.md` — bitácora de sesión nocturna del 23-abr.
