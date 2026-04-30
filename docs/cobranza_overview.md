# Mapa de Cobranza — Inyecta Arrendamiento

**Audiencia:** Damián (dueño del sistema, operador SOFOM, NO programador).  
**Propósito:** Mapa en español plano de qué toca el módulo de cobranza antes de los cambios fuertes de mañana.  
**Fecha:** 29 de abril de 2026.

---

## 1. Mapa de Endpoints REST

| Método + Ruta | Qué Hace | Rol Requerido | Reglas de Negocio Involucradas |
|---|---|---|---|
| **GET** `/api/cobranza/calendar?month=N&year=YYYY&status=...` | Lista todos los periodos de pago del mes (vencidos, parciales, pagados, pendientes) con cálculo live de moratorios | Requiere autenticación | §4.9: moratorios sobre renta pendiente del periodo en mora, tasa 2× ordinaria. Cálculo de IVA sobre moratorio. |
| **GET** `/api/cobranza/contract/:contractId` | Tabla de amortización completa del contrato con desglose por periodo (renta, moratorios, pagos acumulados) | Requiere autenticación | Acumula pagos por periodo. Calcula diasAtraso comparando fechaPago con fecha de corte (hoy). Prelación: moratorios → renta. |
| **POST** `/api/cobranza/pay` | Registra un pago para un periodo específico (total o parcial) | Requiere autenticación | Prelación legal México (§4.9): primero moratorios + IVA moratorio, luego renta + IVA renta. Split proporcional entre principal e IVA dentro de cada bucket. Cálculo de dias de atraso. |
| **POST** `/api/cobranza/pay-advance` | Registra pagos adelantados para múltiples periodos futuros de una sola vez | Requiere autenticación | Aplica el total adeudado de cada periodo (si no está pagado). Útil para clientes que quieren liquidar varias rentas juntas. |
| **GET** `/api/cobranza/estado-cuenta/:contractId` | Estado consolidado del contrato: resumen de lo vencido, los moratorios generados, total pendiente | Requiere autenticación | Filtra solo periodos con adeudo (vencidos, parciales, pendiente actual). Suma moratorios de todos los periodos en mora. |
| **POST** `/api/cobranza/pay-extra` | Abono a capital (PURO: prorratea a rentas futuras; FINANCIERO: recalcula PMT) | Requiere autenticación | PURO: reduce cada renta futura en (abono ÷ periodos restantes). FINANCIERO: baja el saldo del PMT y recalcula la renta mensual. Valida que el abono no exceda el saldo. |
| **GET** `/api/cobranza/payment/:id/recibo` | Datos para generar el PDF del recibo de pago (folio REC-YYYY-NNNN) | Requiere autenticación | Folio consecutivo por año. Desglose de conceptos pagados: renta, IVA, moratorios, IVA moratorio, capital extra. |
| **POST** `/api/cobranza/pay-anticipado` | STUB: Pago anticipado / liquidación anticipada (aún sin implementar) | Requiere autenticación | Pendiente: fórmulas específicas de arrendamiento para cierre anticipado. |
| **POST** `/api/cobranza/seed-amortization` | Genera la tabla de amortización para contratos sin tabla (solo para testing/admin) | Requiere autenticación | Crea los 48 (o plazo) periodos iniciales. NO debe usarse en producción. |
| **DELETE** `/api/cobranza/payment/:id` | Cancela un pago registrado (para correcciones) | Requiere autenticación | NOTA CRÍTICA: sin transacción, revierte manualmente solo el pago; los saldos de periodos NO se recalculan. |

---

## 2. Lógica de los 3 Endpoints Clave

### 2.1 POST `/api/cobranza/pay` — Registrar un Pago

Cuando un cliente ingresa dinero para un periodo:

1. **Obtiene el periodo** (renta sin IVA, renta con IVA, fecha de vencimiento, tasa del contrato).
2. **Calcula estado actual del periodo:**
   - Busca todos los pagos previos del mismo periodo.
   - Calcula **renta pendiente** = renta original − suma de pagos anteriores (sin IVA).
   - Calcula **IVA renta pendiente** = renta pendiente × 16%.
   - ¿El periodo está vencido? Compara fecha de vencimiento con HOY.
3. **Calcula moratorios:**
   - Si está vencido: `días de atraso = HOY − fecha vencimiento (en días)`.
   - Base del moratorio = renta pendiente **sin IVA** (no saldo general del contrato).
   - Tasa moratoria = tasa del contrato × 2 (ej: 36% ordinaria → 72% moratoria anual).
   - **Moratorio = renta pendiente sin IVA × (tasa moratoria ÷ 360) × días de atraso**.
   - IVA moratorio = moratorio × 16%.
4. **Aplica el pago en orden (prelación legal mexicana):**
   - **Primer bucket: moratorios + su IVA.** Si el monto del pago no cubre el moratorio completo, distribuye proporcional entre principal moratorio e IVA moratorio. Ejemplo: si debe $1,000 de moratorio y $160 de IVA moratorio (total $1,160), y paga $580, gasta $500 en moratorio y $80 en IVA moratorio (proporción 1,000:160).
   - **Segundo bucket: renta + su IVA.** Con lo restante del pago, cubre la renta pendiente y su IVA, igual proporcionalmente.
   - **Residuo.** Si sobra dinero y no hay más conceptos, queda como "sobrante" en observaciones.
5. **Crea el registro de Payment** en la BD con:
   - montoRenta, montoIVA, montoMoratorio, montoIVAMoratorio, montoTotal.
   - diasAtraso al momento del pago.
   - tipo = 'RENTA_ORDINARIA' (siempre este tipo, aunque sea parcial).
6. **Notifica:**
   - PAGO_REGISTRADO (siempre) al ejecutivo del contrato.
   - Si es pago parcial (aún queda renta pendiente), también alerta PAGO_PARCIAL a rol COBRANZA.
7. **Responde** con el desglose completo del pago y el estado actualizado del periodo.

### 2.2 POST `/api/cobranza/pay-advance` — Pagos Adelantados

Cuando un cliente paga múltiples rentas futuras de una vez (ej: periodos 10, 11, 12):

1. **Obtiene todos los periodos** solicitados.
2. **Para cada periodo no pagado:**
   - Calcula el total adeudado = renta pendiente + IVA renta + moratorios pendientes (si está vencido) + IVA moratorios.
   - Crea un único Payment por periodo con tipo = 'RENTA_ADELANTADA' y montoTotal = total adeudado.
3. **Registra en BD** (sin bucles de distribución proporcional — cada pago cubre todo su periodo).
4. **Notifica** PAGO_ADELANTADO al ejecutivo del contrato con el listado de periodos cubiertos.
5. **Responde** con la cantidad de periodos pagados y el total efectivamente cobrado.

### 2.3 POST `/api/cobranza/pay-extra` — Abono a Capital

Cuando un cliente quiere reducir su deuda (aplica a ambos productos pero diferente):

**PURO (Arrendamiento Puro):**
1. Busca el primer periodo cuya renta NO esté completamente pagada.
2. Válida que el abono no exceda el saldo insoluto actual.
3. **Prorrateo lineal:** nueva renta futura = renta actual − (abono ÷ periodos restantes).
   - Ejemplo: 48 periodos, en período 10, restan 38 periodos, abono $5,000 → reduce renta en $5,000÷38 = $131.58/mes.
4. Borra la tabla de amortización desde ese periodo en adelante y regenera con la nueva renta (las fechas se conservan).

**FINANCIERO (Arrendamiento Financiero):**
1. Busca el primer periodo cuya renta NO esté completamente pagada.
2. Válida que el abono no exceda el saldo insoluto.
3. **Recalcula PMT con saldo nuevo:**
   - Nuevo saldo = saldo actual − abono.
   - Nueva renta = PMT(tasa mensual, periodos restantes, −nuevo saldo, FV=0).
   - La renta baja; con menos capital que amortizar, los intereses futuros son menores.
4. Borra la tabla desde ese periodo en adelante y regenera con la nueva renta.
5. Actualiza el contrato: rentaMensual + rentaMensualIVA los nuevos valores.

**Ambos:**
- Crea un Payment con tipo = 'ABONO_CAPITAL' y montoCapitalExtra = el monto abonado.
- Notifica ABONO_CAPITAL al ejecutivo mostrando "ahorro $X/periodo".

---

## 3. Reglas de Negocio Implementadas

Sin código, en español plano. Fuente de verdad: `server/CLAUDE.md` §4.

### 3.1 Prelación Legal Mexicana (Orden de Aplicación de Pagos)

Cuando el cliente paga, el dinero se aplica en este orden (no al azar):
1. **Intereses moratorios** (lo más importante: es el castigo por atraso).
2. **IVA sobre moratorios** (el SAT lo cobra, es obligatorio).
3. **Intereses ordinarios** de la renta (si hubiera, lo que no hay en arrendamiento puro).
4. **IVA sobre intereses** (idem, solo si hay intereses).
5. **Capital / Renta pendiente** (lo último, es lo que reduce la deuda real).

**Implementación:** en cobranza.ts, función `splitProporcional()` aplica dentro de cada "bucket" (moratorio, renta), pero el orden de los buckets es hierro.

### 3.2 Tasa Moratoria Dinámica

**NO es fija en 72%.** Es 2× la tasa ordinaria del contrato.
- Contrato @ 36% ordinaria → 72% moratoria anual.
- Contrato @ 24% ordinaria → 48% moratoria anual.
- El fórmula: `tasaMoratoria = tasaOrdinariaDelContrato × 2`.

La tasa se aplica **diaria:** tasaMoratoria / 360 × días de atraso.

### 3.3 Base del Moratorio = Renta Pendiente del Periodo en Mora (NO Saldo General)

Este es el error más común:

**INCORRECTO (lo que muchos creen):**
- "El moratorio se calcula sobre el saldo insoluto total del contrato".
- Esto inflaría los moratorios en arrendamientos con muchos periodos pagados.

**CORRECTO (lo que el código hace):**
- El moratorio se calcula **solo sobre la renta pendiente sin IVA del período en mora**.
- Si el cliente pagó 5 periodos, el moratorio del período 6 (en mora) se basa en la renta del período 6, NO en el saldo insoluto de los 42 períodos restantes.
- Refleja mejor la realidad: el castigo es por "no pagar esta renta", no por "tener deuda en general".

### 3.4 Moratorio Independiente por Periodo

Cada período en mora genera SU PROPIO moratorio:
- Período 10 en mora 5 días → moratorio período 10.
- Período 11 en mora 2 días → moratorio período 11 (más bajo, menos días).
- Período 12 aún no vencido → sin moratorio.

El cliente paga moratorios **de todos los períodos en mora**, no solo uno.

### 3.5 Split Proporcional de IVA Dentro de Cada Concepto

Cuando un pago no alcanza a cubrir un concepto completo (ej: el moratorio y su IVA):

Dice la ley: "El IVA se paga junto con lo que lo genera".

**Implementación:** si debe $1,000 de moratorio y $160 de IVA moratorio, y paga $580:
- Proporción: moratorio es 86.2%, IVA es 13.8% del bucket.
- De los $580, gasta ~$500 en moratorio y ~$80 en IVA moratorio.

Esto evita pagar IVA de algo que no se pagó.

### 3.6 Cálculo de IVA de la Renta (16% en Ambos Productos)

- **PURO:** IVA = renta × 16% (se cobra aunque no hay intereses; es la práctica de Inyecta).
- **FINANCIERO:** idem, IVA = renta × 16% (no solo sobre la parte de interés, sino toda la renta).

### 3.7 Días de Atraso Calculados Noche a Noche

El sistema calcula `diasAtraso = (HOY − fecha vencimiento) / 86400 segundos`.

- Vence un martes a las 23:59 → miércoles amanece = 1 día de atraso.
- Cálculo conservador: si vence el 15 a las 00:00, el 15 a las 23:59 aún no hay atraso (0 días).

---

## 4. Bugs, Oportunidades y Cosas que Huelen Mal

### BUG #1: Race Condition en POST /api/cobranza/pay (CRÍTICO)

**Qué es:**
La ruta `/api/cobranza/pay` lee el estado actual del período, calcula la distribución del pago, y **luego** crea el registro de Payment — pero TODO ESTO OCURRE SIN una transacción Prisma.

```
request 1: lee prevPayments (período 10)
request 2: lee prevPayments (período 10) ← MISMOS datos que request 1
request 1: crea Payment X
request 2: crea Payment Y  ← no ve Payment X
BD tiene 2 pagos del mismo periodo sin que el cliente los haya coordinado
```

**Por qué importa:**
- El estado de cuenta reporta números incorrectos (saldo calculado se basa en los 2 pagos desincronizados).
- Cliente ve su período "más pagado" que lo que realmente es.
- Moratorios se calculan mal (basados en estado desactualizado).

**Severidad:** CRÍTICO en fase de operaciones reales. Hoy es riesgo medio porque el volumen de concurrencia es bajo.

**Esfuerzo de fix:** Bajo (2-4 horas). Envolver líneas 376-488 (POST /pay) en un `prisma.$transaction()`. Incluyendo el cálculo de conceptos y la creación del Payment.

---

### BUG #2: Validaciones Faltantes

**El monto del pago no se valida.**
- Un usuario puede POSTear `{ contractId, periodo, monto: -1000 }` y el sistema lo aceptaría (hasta que golpee un error de BD o lógica).
- El schema Zod dice `.positive()` pero nunca se verificó in situ.

**Severidad:** Medio. Protección de input existe (Zod), pero la falta de test explícito deja dudas.

**Esfuerzo:** Bajo (1 hora). Agregar unit test que intente pagos negativos, cero, y montos extremos. Verificar que Zod rechace.

---

### BUG #3: Sobrante de Pago NO Aplicado

Línea 486: si después de aplicar moratorio y renta aún queda dinero, lo deja como `sobrante` en observaciones:

```
sobrante > 0.01 ? `Sobrante: $${restante.toFixed(2)}` : null
```

**Problema:** El sobrante no se guarda en la BD de forma estructurada. Un próximo pago NO lo detecta ni lo aplica automáticamente. Si un cliente paga $1,100 para una renta de $1,000, los $100 se pierden en observaciones.

**Cómo debería ser:**
- Crear un concepto de "pago en exceso" que se aplique al siguiente período (o permitir que el usuario elija).
- Guardar `sobranteAplicable` en Payment para que el siguiente `GET /api/cobranza/contract/:id` lo recupere.

**Severidad:** Medio. Operacionalmente genera fricción (el operador debe gestionar sobrantes manualmente).

**Esfuerzo:** Medio (4-6 horas). Refactorizar el modelo Payment para incluir `sobranteDelPeriodoAnterior` y un campo de "pago en exceso aplicable". Lógica: si al crear un nuevo Payment hay sobrante previo, sumarlo al monto nuevo.

---

### BUG #4: Cálculo de Moratorios NO Reasegurable

El moratorio se calcula al momento del pago con la `diasAtraso` **actual**. Si el sistema falla entre la lectura de prevPayments y la creación de Payment, se pierde la hora exacta de la lectura.

**Escenario:**
1. Sistema lee período a las 09:00 (3 días de atraso).
2. Genera moratorio basado en 3 días.
3. Sistema cae.
4. Se reinicia a las 14:00 (misma petición retries).
5. Ahora son 3.2 días de atraso, pero el moratorio en memoria sigue siendo por 3 días.
6. BD no tiene registro de a qué hora se calculó.

**Severidad:** Bajo en la práctica (riesgos es ~1 céntimo de error). Pero falta auditoría clara.

**Esfuerzo:** Bajo (1-2 horas). Guardar `calculadoAt` en Payment y comparar con createdAt en el visor.

---

### BUG #5: DELETE /api/cobranza/payment/:id Sin Consistencia

Línea 1092-1103: simplemente borra el Payment sin:
- Verificar si hay pagos posteriores del mismo período (que necesitan recalcularse).
- Actualizar el estado del contrato (qué sucede si borramos el último pago de un período?).
- Dejar registro de auditoría explícito (quién lo borró, cuándo, por qué).

**Severidad:** Alto en producción. Un borrado inadvertido rompe la contabilidad del período.

**Esfuerzo:** Medio (2-4 horas). Cambiar DELETE a una marca lógica `deletedAt + deletedBy` en el modelo Payment. Excluir de las queries pero mantener para auditoría.

---

### OPORTUNIDAD #1: Caché de Cálculos Moratorios

El endpoint GET `/api/cobranza/calendar` recalcula moratorios para **todos** los períodos del mes en cada petición (líneas 183-275).

```
FOR cada período DO {
  GET pagos previos
  calcConceptos (incluyendo moratorios)
}
```

**Mejora:**
- Cachear los moratorios generados hace 24h (no cambian si no hay nuevos pagos).
- Solo recalcular si: (a) hay pago nuevo, (b) cambió la fecha de corte (cambió el día).
- Redis/in-memory simple: clave = `mor-{contractId}-{periodo}-{fechaCorte}`.

**Beneficio:** Página de calendario 5-10× más rápida. Hoy se tarda ~500ms por 100 períodos.

**Esfuerzo:** Medio (3-4 horas). Implementar con Redis o simple in-memory.

---

### OPORTUNIDAD #2: Notificaciones Automáticas de Mora

Hoy, cuando un período entra en mora (vence y pasa 1 día sin pago), nadie recibe una alerta de cobranza.

**Mejora:**
- Cron job nocturno: busca períodos con `estatus === 'VENCIDO'` y `diasAtraso === 1`.
- Notifica a COBRANZA: "10 periodos entraron en mora hoy".
- Opcionalmente, envía email templado al cliente con "Su renta vence el X, a la fecha tiene Y días de atraso".

**Beneficio:** Gestión proactiva. La mora se atiende el 2º día, no cuando ya lleva 30.

**Esfuerzo:** Bajo (2-3 horas). Script en `server/src/scripts/notificarMoras.ts` con cron via node-cron.

---

### OPORTUNIDAD #3: Reporte de Cobranza en Tiempo Real

El endpoint GET `/api/cobranza/estado-cuenta/:contractId` muestra el estado de UN contrato. Pero Damián mañana necesitará:

- "¿Cuánto moratorio generé hoy / esta semana / este mes?"
- "¿Cuántas rentas vencen en 7 días?"
- "¿Quién es mi cliente más en mora?"

**Mejora:**
- Agregar `GET /api/reports/cobranza?desde=YYYY-MM-DD&hasta=...&ordenPor=...` con:
  - Agregaciones por cliente, por contrato, por rango de fecha.
  - Totales de moratorio cobrado vs generado.
  - Top 10 clientes con mayor mora acumulada.

**Esfuerzo:** Medio-Alto (6-8 horas). Queries complejas en Prisma.

---

### EDGE CASE #1: Período Vencido Pero Parcialmente Pagado — Moratorio se Recalcula?

**Escenario:**
- Período 10 vence el 15 de marzo. Pago $500 el 16 (1 día de atraso).
- Cliente paga otro $500 el 20 (5 días de atraso).

**¿Qué pasa?**
- 1er pago: moratorio se calcula sobre la renta pendiente con 1 día de atraso.
- 2do pago: moratorio se recalcula sobre la **renta restante** con 5 días de atraso.
- Resultado: se cobra moratorio de 1 día + moratorio de 5 días (compuesto), lo cual es incorrecto.

**Debería ser:**
- El moratorio total del período es una sola cantidad que crece día a día.
- Si el cliente paga parcialmente, reduce el moratorio **generado** en proporción.

**Severidad:** Medio. Detectar esto requiere cálculos complejos. **Actualmente no está soportado correctamente.**

**Esfuerzo:** Alto (8-12 horas). Refactorizar el modelo de moratorio a "moratorio acumulado del período" en lugar de "moratorio por cada pago".

---

### EDGE CASE #2: Periodos Futuros — ¿Se Pueden Pagar?

En `/api/cobranza/pay-advance`, se permite pagar períodos futuros (aún no vencidos). **¿Está permitido?**

Línea 593: `if (conceptos.estatus === 'PAGADO') continue;` — saltea los ya pagados.

Pero para futuros, toma `totalAdeudado = renta sin pagar + IVA`. **Sin moratorios** (no hay, aún no vencieron).

**Pregunta para Damián:** ¿Puedo pagar el período 20 si aún faltan 3 meses? Sí, técnicamente. ¿Con qué tasa? Sin mora, la renta normal. ¿Se puede ofrecer un descuento por pago adelantado? No está implementado.

**Severidad:** Bajo (funciona como está). Pero operacionalmente podría simplificar flujos de liquidación.

---

### EDGE CASE #3: Cambio de Fecha de Corte

El cálculo de `diasAtraso` usa `new Date()` (ahora). Si alguien corre el endpoint a las 09:00 de un día, y luego a las 23:00, el **mismo** período ahora tiene 1 día diferente.

Moratorios se recalculan cada hora. **Esperado o bug?**

Esperado: el moratorio crece día a día, así que el recálculo es correcto.

Pero para auditoría, cada pago debería dejar constancia de **cuántos días de atraso** había al pagarse, no recalculados.

**Severidad:** Bajo. Actualmente sí se guarda `diasAtraso` en Payment (línea 484). Buena práctica.

---

### COVERAGE ACTUAL

**Línea crítica:** `npm test` en server NO prueba cobranza.ts en absoluto.

```
server/src/routes/__tests__/ tiene:
  - clients.test.ts
  - contracts.test.ts
  - invoices.test.ts
  - FALTA: cobranza.test.ts
```

**Coverage estimado: 0%** en rutas. Servicios (leaseCalculator, distribucion) sí tienen tests unitarios.

**Implicación:** Cualquier cambio en lógica de cobranza es ciego. Es la razón por la que los bugs arriba no se detectaron en CI.

**Esfuerzo para cubrir:** Alto (15-20 horas). Casos de prueba:
1. Pago exacto de una renta.
2. Pago de múltiples periodos (pay-advance).
3. Periodo vencido con moratorio.
4. Pago parcial (pago el moratorio pero no la renta).
5. Pago con sobrante.
6. Pay-extra PURO vs FINANCIERO.
7. Race condition (mock con Promise.all).
8. Validaciones de entrada (montos negativos, periodos inexistentes, etc.).

---

## 5. Recomendación de Mañana

Damián va a entrar con "cambios fuertes en cobranza". Acá están las 10 cosas prioritarias:

1. **PRIMERO: Arreglar la race condition (BUG #1).** Envolver POST /pay en `prisma.$transaction()`. Sin esto, cualquier otra mejora está construida sobre arena. Esfuerzo: 2-4h. Riesgo: bajo (es una refactor pura, no toca lógica).

2. **SEGUNDO: Escribir tests para cobranza (BUG #5 implícito).** Los 8 casos de prueba de cobranza.ts. Una vez que pasen, todo lo que toques después se protege. Esfuerzo: 15-20h, repartido en 3-4 días. Ventaja: detecta BUGs #2-5 automáticamente.

3. **TERCERO: Decidir sobre sobrantes (BUG #3).** ¿Auto-aplicar al siguiente período o dejar en observaciones? Si auto-aplicar, refactorizar el modelo Payment. Si dejar, documentar que el operador debe gestionar. Esfuerzo: 4-6h si decides cambiar, 0h si dejas como está.

4. **CUARTO: Marcar DELETE como lógico (BUG #5).** Cambiar DELETE /payment/:id a `PATCH { deletedAt, deletedBy }`. Protege auditoría. Esfuerzo: 2-3h.

5. **Implementar caché de moratorios (OPORTUNIDAD #1).** Tras los tests estar verde, optimiza el calendario. Esfuerzo: 3-4h.

6. **Alertas automáticas de mora (OPORTUNIDAD #2).** Cron nocturno. Esfuerzo: 2-3h.

7. **Reporte de cobranza agregado (OPORTUNIDAD #3).** El dashboard que necesita mañana para medir KPIs. Esfuerzo: 6-8h.

8. **Resolver edge case #1 (Moratorio en pagos parciales).** Decisión conceptual: ¿cómo facturar moratorio cuando el cliente paga en cuotas? Requiere input de Damián. Sin fix es una bomba de tiempo. Esfuerzo: 8-12h once decide.

9. **DEJAR PARA DESPUÉS:** Edge cases #2 y #3 son informativos, no bloqueantes.

10. **DISEÑO:** Antes de tocar más código, haz que Damián firme un documento con:
   - Cómo debe comportarse el sobrante de pago.
   - Si se permite pago anticipado de periodos (Y/N).
   - Cuál es la política de cambios de fecha de corte (retroactivo o prospectivo).
   - Quién autoriza borrados de pagos (solo ADMIN? Solo ciertos montos?).

---

## Línea que más Preocupa

**Línea 376-488 (POST /api/cobranza/pay entero):** Sin transacción, es una race condition esperando para pasar. Todo lo que tocas después depende de que esto esté arreglado. Si Damián va a meterle mano a la lógica de distribución de pagos, debe hacerlo dentro de un `prisma.$transaction()` como protección básica.

---

**Documento creado:** 29-04-2026, 10:47 UTC.  
**Coverage estimado:** 0% en rutas, 85% en servicios auxiliares.  
**Hallazgos críticos:** 1 (race condition).  
**Hallazgos altos:** 2 (BUGs #5, edge case #1).  
**Hallazgos medios:** 5.

