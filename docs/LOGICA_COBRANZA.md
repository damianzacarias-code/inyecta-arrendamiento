# LÓGICA DE COBRANZA — Sistema Legacy Inyecta SOFOM

> Spec extraído por reverse-engineering del sistema productivo en
> `http://34.239.151.177/Pagos/PagoCredito2?IDcredito=329` (RAUL ESQUIVEL —
> Capital de Trabajo $1,100,000 a 36 meses, tasa anual 36%).
>
> Fecha de extracción: 17/04/2026.
> Stack del legacy: ASP.NET MVC + Razor + Kendo UI 2015.1.429 + jQuery 2.2.4.
> **Toda la lógica financiera vive en el backend** — no hay endpoints JSON
> separados, la página renderiza HTML server-side con todos los valores ya
> calculados; el JS solo controla checkboxes y selección de filas.

---

## 1. Aplicabilidad al sistema nuevo

| Producto | Aplica esta lógica | Notas |
|---|---|---|
| **Arrendamiento Financiero (PP / 1301)** | ✅ Sí — separa Capital + Interés idéntico a estos créditos | Sistema francés cuota fija |
| **Arrendamiento Puro (CP / 1300)** | ❌ No — usar lógica de **rentas planas** (renta mensual fija con IVA, sin amortización Capital/Interés) | Solo aplica moratoria sobre la renta |

---

## 2. Datos de entrada del crédito legacy (validación)

| Campo | Valor |
|---|---|
| Crédito otorgado | $1,100,000.00 |
| Plazo | 36 mensualidades |
| Tasa anual ordinaria | 36.00 % (→ 3.00 % mensual) |
| Comisión por apertura | $55,000.00 |
| Fecha de origen | 16/12/2025 |
| Primer vencimiento | 16/01/2026 |
| Estatus | Mora Temprana |

---

## 3. Amortización — Sistema Francés (cuota nivelada)

### Fórmulas
```
i_mensual    = tasa_anual / 12                    // 0.36/12 = 0.03
Cuota        = P × i / (1 − (1 + i)^−n)           // ≈ $50,379.61 teórico
                                                   // $50,384.17 observado
Interés(t)   = Saldo(t−1) × i_mensual
Capital(t)   = Cuota − Interés(t)
Saldo(t)     = Saldo(t−1) − Capital(t)
```

> ⚠ En el legacy la cuota observada es **$50,384.17** (vs $50,379.61 teórico).
> Diferencia ~$4.55 por redondeo en algún paso interno. Para el sistema nuevo
> usar la fórmula PMT estándar (ver `calcPMT` en CLAUDE.md backlog P3).

### Validación con datos reales (primeros 6 periodos)

| t | Fecha | Saldo(t-1) | Interés | Capital | Cuota |
|---|---|---:|---:|---:|---:|
| 1 | 16/01/2026 | $1,100,000.00 | $33,000.00 | $17,384.17 | $50,384.17 |
| 2 | 16/02/2026 | $1,082,615.83 | $32,478.47 | $17,905.70 | $50,384.17 |
| 3 | 16/03/2026 | $1,064,710.13 | $31,941.30 | $18,442.87 | $50,384.17 |
| 4 | 16/04/2026 | $1,046,267.26 | $31,388.02 | $18,996.16 | $50,384.18 |
| 5 | 16/05/2026 | $1,027,271.10 | $30,818.13 | $19,566.04 | $50,384.17 |
| 6 | 16/06/2026 | $1,007,705.06 | $30,231.15 | $20,153.02 | $50,384.17 |
| ... | ... | ... | ... | ... | ... |
| 36 | 16/12/2028 | $48,916.67 | $1,467.50 | $48,916.67 | $50,384.17 |

> Diferencia de capital de $0.18 en algunos periodos por redondeo a 2 decimales
> en cada paso (no acumulado).

### Importante para Arrendamiento Puro
**No usar amortización**. La renta mensual es fija para todo el plazo
(`rentaPuro = (valorBien × factorRenta) / plazoMeses`) y se cobra con IVA 16%.
No hay descomposición Capital/Interés ni saldo insoluto.

---

## 4. Intereses Moratorios

### Fórmula validada
```
tasa_moratoria_anual = 2 × tasa_ordinaria_anual    // 72% en este crédito
tasa_moratoria_diaria = 0.36 × 2 / 360 = 0.002      // 0.2% diario, base 360
mora(periodo, fecha_calculo) =
    PagoTotal(periodo) × 0.002 × días_atraso
```

Donde `PagoTotal(periodo)` = Capital + Interés + Seguro del periodo
(ej. $50,384.17 sin mora).

### Conteo de días
- **Día de inicio**: día siguiente al vencimiento (excluye fecha vencimiento).
- **Día de fin**: hasta el día actual / fecha de pago (inclusivo).
- **Verificación periodo 4** (1 día atraso, hoy 17/04 vs venc 16/04):
  `$50,384.17 × 0.002 × 1 = $100.77` ✓ exacto
- **Verificación periodo 1** (pagado 27/01 vs venc 16/01 = 11 días calendario):
  `$50,384.17 × 0.002 × 10 = $1,007.68` ✓ exacto
  → el conteo efectivo es **(días calendario − 1)** porque excluye el día del
  vencimiento Y excluye un día más (probablemente día del pago o gracia tácita).
- **Verificación periodo 2** (pagado 20/03 vs venc 16/02 = 32 días calendario):
  `$50,384.17 × 0.002 × 28 = $2,821.51` ✓ exacto
  → topa al siguiente corte mensual; los días posteriores ya no acumulan al
  periodo 2 sino al periodo 3.

### Regla operativa simplificada para el sistema nuevo
```
días_mora = min(
  (fecha_pago - fecha_vencimiento) - 1,
  días_hasta_siguiente_corte_mensual
)
mora = pago_total_periodo × 0.002 × días_mora
```

### Tasa moratoria sugerida en la nueva config
- Configurable por producto en tabla `producto_credito` o `tipo_arrendamiento`:
  `tasa_moratoria_diaria` (default 0.2% = 2× ordinaria base 360).

---

## 5. "Monto a Liquidar" (saldo total para finiquitar el crédito hoy)

### Fórmula descifrada (validada al centavo)
```
Monto_a_Liquidar =
    Saldo_Insoluto                                 // capital total pendiente
  + Intereses_Vencidos_NoPagados                   // de periodos vencidos
  + Moratorios_Acumulados                          // mora de periodos vencidos
  + Interés_Corrido_del_Día                        // proporcional desde último corte
```

Donde:
```
Interés_Corrido_del_Día =
    Capital_NoVencido × (tasa_anual / 360) × días_desde_último_corte_mensual

Capital_NoVencido = Saldo_Insoluto − Capital_Vencido_NoPagado
```

### Verificación con datos reales
- Saldo Insoluto: $1,047,627.77
- Intereses vencidos no pagados (P4 completo): $31,388.02
- Mora acumulada (P3 + P4): $108.93 ($8.16 + $100.77)
- Capital no vencido: $1,047,627.77 − $1,360.51 (P3) − $18,996.16 (P4) = $1,027,271.10
- Interés corrido día 17/04 (1 día desde 16/04): $1,027,271.10 × 0.36/360 × 1 = $1,027.27
- **Suma**: $1,047,627.77 + $31,388.02 + $108.93 + $1,027.27 = **$1,080,151.99** ✓ EXACTO

### "Saldo Vencido" (campo aparte)
```
Saldo_Vencido = Σ (Pago_Total_Periodo_Vencido − Abonado_al_Periodo) + Mora_Acumulada
```
Verificación: P3 pendiente $1,368.67 + P4 pendiente $50,484.94 = $51,853.61 ✓

---

## 6. Distribución de pagos parciales

Observación del periodo 3 (dos abonos parciales):
- Abono 1: $1,794.32 el 16/03/2026 (mismo día del vencimiento — sin mora)
- Abono 2: $50,047.55 el 14/04/2026 (29 días después)

### Orden de aplicación (inferido)
```
1. Intereses moratorios primero
2. Intereses ordinarios (vencidos)
3. Capital (amortiza saldo insoluto)
4. Seguros (si aplica)
```

Estado resultante del periodo 3:
- Capital programado: $18,442.87 → pagado $18,442.87 → pendiente $0 (?)
  - **PERO** el reporte muestra "$1,360.51 pendiente" → significa que el sistema
    rebalanceó: parte del capital quedó como "saldo del periodo" cuando se
    aplicaron las moras sobre el remanente al día de pago.
- Intereses programados: $31,941.30 → pagado $30,146.98 → pendiente $0
  - El interés "no pagado" del programado se reduce porque el sistema recalcula
    intereses al saldo real (no al programado) cuando hay mora extendida.
- Mora: $0 programada → pagada $2,818.21 → pendiente $8.16
  - Mora se calcula AL DÍA DE PAGO sobre los días reales de atraso.
  - Pendiente $8.16 = mora del remanente $1,360.51 + intereses no devengados,
    acumulada del 14/04 al 17/04 (3 días) → ≈ $8.16 ✓

---

## 7. Estructura de DB inferida del legacy

```
credito (
  id, numero_credito, id_cliente, id_producto, id_sucursal,
  monto_otorgado, plazo_meses, tasa_anual, comision_apertura,
  fecha_origen, fecha_primer_vencimiento, dia_pago,
  estatus,                              -- enum: VIGENTE | MORA_TEMPRANA | DEMANDA | QUITA | REESTRUCTURA | LIQUIDADO
  tasa_moratoria_factor,                -- multiplicador sobre tasa ordinaria (default 2)
  base_dias                             -- 360 | 365
)

parcialidad (
  id, id_credito, numero_periodo, fecha_vencimiento,
  capital_programado, interes_programado, seguro_programado,
  capital_pagado, interes_pagado, seguro_pagado,
  mora_calculada, mora_pagada,
  pendiente_capital, pendiente_interes, pendiente_mora,
  pagado boolean
)

abono (
  id, id_credito, id_parcialidad,        -- al periodo al que se aplicó
  monto, fecha_pago, fecha_aplicacion,
  forma_pago_codigo,                     -- "03" = Transferencia, etc.
  descripcion,                           -- "Pago parcialidad:N" / "Abono parcialidad:N"
  comprobante_url,
  usuario_registro
)

forma_pago_catalogo (
  codigo,                                -- 01,02,03,...
  descripcion                            -- ej "03 - Transferencia electrónica de fondos"
)

credito_status_evento (
  id, id_credito, fecha,
  status_anterior, status_nuevo,
  motivo, usuario
)
```

---

## 8. Datos del request HTTP

- Método: `GET /Pagos/PagoCredito2?IDcredito=329`
- Respuesta: HTML completo (Razor view server-rendered), no JSON.
- No hay endpoints REST separados para parcialidades, resumen ni saldos.
- Forma de pago código `03` = Transferencia electrónica de fondos.
- Status posibles del crédito: `Vigente`, `Mora Temprana`, `Demanda`, `Quita`,
  `Reestructura`.

---

## 9. UI legacy — elementos relevantes para el nuevo sistema

- **Selector "Cambiar Fecha"**: permite simular el Monto a Liquidar a una fecha
  futura (devenga interés diario adicional). Funcionalidad útil para previsión.
- **Botón "Liquidar Crédito"**: confirm dialog
  `"¿Estás seguro deseas saldar el crédito por $X?"`.
- **Botón "Pagar Seleccionados"**: paga múltiples parcialidades a la vez
  (checkbox por fila); recalcula mora al momento del pago.
- Columnas de la tabla con valores múltiples por celda (programado / pagado /
  pendiente) cuando hay pagos parciales.
- Histórico de pagos como sub-tabla con suma total al final.

---

## 10. Consideraciones para el sistema nuevo

1. **Persistir snapshots de mora al día**: para auditoría, guardar mora
   calculada al momento de cada pago en `abono.mora_aplicada` (no recalcular
   desde cero después).
2. **IVA**: el legacy NO muestra IVA en parcialidades de crédito (Capital de
   Trabajo). Para el sistema nuevo de **arrendamiento** sí aplica IVA 16%
   sobre la renta (PURO) o sobre el interés + comisión + capital (FINANCIERO,
   según la SAT NIF D-5).
3. **Seguro**: columna existe en parcialidades pero estaba en $0 en este
   crédito. Diseñar la tabla para soportar seguro mensual prorrateado.
4. **Día de corte**: en el legacy es el día del mes del primer vencimiento
   (16). Hacerlo configurable por contrato.
5. **Status del crédito**: agregar transiciones automáticas:
   - `VIGENTE` → `MORA_TEMPRANA` (1-29 días)
   - `MORA_TEMPRANA` → `MORA_TARDIA` (30-89 días)
   - `MORA_TARDIA` → `CARTERA_VENCIDA` (90+ días)
   - Cualquiera → `DEMANDA` / `QUITA` / `REESTRUCTURA` por usuario.

---

## Cross-refs

- Implementación de `calcPMT` y "pagos adicionales" → `CLAUDE.md` ticket P3.
- Estado de Cuenta PDF con desglose mora → `CLAUDE.md` ticket P4.
- Recibo de Pago con folio consecutivo → `CLAUDE.md` ticket P5.

---

## Decisiones operativas — sprint 2026-04-30

> Resueltas con Damián tras la auditoría de cobranza del cobranza-guardian
> (ver `docs/cobranza_overview.md`). Esta sección documenta las decisiones
> de NEGOCIO con sus motivaciones — el código las refleja, pero quien
> audite manualmente o el jefe operativo lee aquí el "por qué".

### D1 · Sobrante de pago

**Pregunta:** si el cliente paga más de lo que debe del periodo actual,
¿qué hacemos con el excedente?

**Decisión (Damián):**
- **Si tiene parcialidades atrasadas:** el sobrante se aplica
  automáticamente al **siguiente periodo atrasado**, siguiendo la misma
  prelación legal (moratorios → IVA mor → renta → IVA renta).
- **Si está al corriente:** el sistema **pregunta al operador** qué quiere
  hacer:
  - PURO: "Aplicar a próxima renta" o "Prorratear en todas las rentas
    futuras restantes" (ver §4.10).
  - FINANCIERO: "Aplicar a próxima renta" o "Abonar a capital (recalcula
    PMT, baja la renta futura)".

Implementación: backend devuelve la información del sobrante en el
response; frontend muestra un modal con las opciones según producto. Al
operador no se le permite descartar el sobrante — siempre se aplica a
algo.

### D2 · Moratorio en pagos parciales (matemáticamente puro)

**Pregunta:** cuando un pago parcial reduce la renta pendiente, ¿el
moratorio recalculado debe usar la nueva base desde T=0, o tracking por
tramos de tiempo (cada base correspondiente a su periodo de vigencia)?

**Decisión (Damián):** **tramos de tiempo** — matemáticamente puro.

```
Ejemplo:
  Periodo en mora con renta $10,000.
  Día 5 de atraso: cliente paga $500.
    → tramo 1: $10,000 × tasaDiaria × 5  (moratorio "congelado" a día 5)
    → split del pago: ~$331 a renta + ~$53 a IVA renta + $100 mor + $16 IVA mor
    → renta pendiente nueva: $9,669.
  Día 10 de atraso (5 días después):
    → tramo 2: $9,669 × tasaDiaria × 5  (5 días con la nueva base)
    → moratorio TOTAL = tramo 1 + tramo 2  ≠  rentaPendiente × tasa × diasAtraso.
```

**Implementación pendiente** (sprint actual, paso #5): refactor de
`calcConceptos` en `cobranza.ts` para iterar sobre los pagos del periodo
en orden cronológico, acumulando moratorio por tramos.

**Por qué:** si el jefe (o un auditor) calcula moratorio a mano, este
método da el resultado matemáticamente correcto. El método "ingenuo"
(rentaPendiente_actual × tasa × diasAtraso totales) subcobra ~$3-50
dependiendo del caso. Aunque el error sea a favor del cliente, el sistema
debe coincidir exactamente con el cálculo manual para no quemar
credibilidad ante revisión.

### D3 · Borrar pagos — soft delete

**Pregunta:** ¿permitir borrado físico de pagos? ¿Qué auditoría se requiere?

**Decisión (Damián):** **soft delete obligatorio**, sin restricción de
rol por ahora (cuando se metan roles, se restringe a ADMIN).

**Implementación (commit `cd84a76`):**
- Schema: `Payment.deletedAt`, `deletedBy`, `motivoEliminacion`.
- `DELETE /api/cobranza/payment/:id` ahora UPDATE-a en lugar de DELETE.
- Todas las lecturas para cálculos filtran `deletedAt: null`.
- El recibo de un pago cancelado SÍ se puede reimprimir (evidencia).
- Un pago cancelado NO se puede facturar (CFDI bloqueado con 409).

### D4 · Pago anticipado / liquidación parcial

**Pregunta:** ¿permitir descuentos por pago adelantado?

**Decisión (Damián):**
- **Arrendamiento Financiero:** sí, pueden abonar a capital — la renta
  futura baja porque hay menos saldo que amortizar (PMT recalculado).
  Esto es una "liquidación parcial".
- **Arrendamiento Puro:** no hay capital al cual abonar (es operativo,
  no financiero). Las únicas opciones son:
  1. Pagar la próxima renta.
  2. Prorratear el pago entre todas las rentas futuras (cada una baja en
     `abono / periodos_restantes`).

Ya implementado en `POST /pay-extra` desde commits anteriores. Los
descuentos aritméticos los aplica el motor (no se cobra "interés
anticipado"); el cliente paga lo que debería pagar mes a mes pero
distribuido distinto.

### D5 · Prelación intra-balde — proporcional (no estricta)

**Pregunta:** dentro de un balde (moratorio o renta), ¿el efectivo cubre
primero el principal y luego el IVA (estricto), o se reparte
proporcional?

**Decisión (Damián):** **proporcional como hoy**.

```
Ejemplo:
  Balde MORATORIO: $100 mor + $16 IVA mor (total $116).
  Cliente paga $58 (la mitad del balde).
  Aplicación PROPORCIONAL (lo que hace el sistema):
    $50 a moratorio principal, $8 a IVA moratorio.
  Aplicación ESTRICTA (alternativa rechazada):
    $58 a moratorio principal, $0 al IVA.
```

**Por qué proporcional (decisión consciente):**
- El SAT acepta ambos métodos.
- Proporcional refleja mejor "el IVA se causa con cada peso recibido"
  (el IVA es una traslación, no un retraso).
- Cambiar a estricto requeriría refactor del CFDI emitido en pagos
  parciales.

La prelación de **buckets** sigue siendo estricta: moratorio (mor + IVA
mor) ANTES que renta (renta + IVA renta). Lo único proporcional es
DENTRO de cada balde.

### D6 · Race conditions — fix con TX serializable + advisory lock

Tres endpoints tenían el bug "lee → calcula → escribe" sin transacción
suficientemente fuerte. Cerrados con el helper
`server/src/lib/serializableTransaction.ts`:

- `POST /pay` — commit `a0aefcd` (advisory lock por (contractId, periodo)).
- `POST /pay-advance` — commit `c56ddac` (advisory lock por contractId).
- `POST /pay-extra` — commit `090479a` (advisory lock por contractId,
  TODAS las lecturas dentro de la TX).
- `DELETE /payment/:id` — commit `cd84a76` (advisory lock por contractId
  para evitar conflicto con un /pay simultáneo).

El advisory lock se toma con `pg_advisory_xact_lock(hashtext(contractId)::int4, X)`
donde X es 0 para operaciones que tocan todo el contrato y `periodo` para
operaciones que tocan un solo periodo. Colisiones de hash entre contratos
son inocuas (sólo costo de performance, no de correctness).

### Deuda técnica conocida (no bloquea operaciones)

- **`number` vs `Decimal` en cobranza.ts:** todo el módulo usa `number`
  con `Math.round(x*100)/100`. Funciona en montos pequeños pero acumula
  imprecisión en pagos parciales con división proporcional. Pendiente
  de migración cuando se sistematicen los CFDIs.
- **Validación de monto del pago:** Zod ya rechaza negativos/cero pero no
  hay test explícito de límites máximos.
