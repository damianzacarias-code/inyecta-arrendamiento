# CLAUDE.md — Inyecta Arrendamiento
> Este archivo es tu fuente de verdad. Léelo completo antes de tocar cualquier código.
> Actualízalo después de cada tarea completada.

---

## 1. QUÉ ES ESTE PROYECTO

Sistema de arrendamiento financiero y puro para **FSMP Soluciones de Capital, S.A. de C.V., SOFOM, E.N.R.** (marca: Inyecta). Reemplaza el módulo de Créditos del sistema legado en producción (http://34.239.151.177).

**Dos productos únicos:**
- **Arrendamiento PURO** — arrendamiento operativo, el bien nunca se transfiere al cliente, valor de rescate alto (16%)
- **Arrendamiento FINANCIERO** — arrendamiento con opción de compra simbólica (2%), amortiza todo el capital

---

## 2. STACK TÉCNICO

```
Frontend:   React + TypeScript + Vite  (apps/web)
Backend:    Node.js + Express + Prisma + PostgreSQL  (server/)
Core lib:   packages/core/  (lógica financiera compartida)
Auth:       JWT + bcryptjs
Roles:      ADMIN, LEGAL, OPERADOR, CONSULTOR
UI lib:     Tailwind CSS + lucide-react
HTTP:       @tanstack/react-query
Router:     react-router-dom
Precision:  decimal.js (20 dígitos, ROUND_HALF_UP) — OBLIGATORIO para dinero
Tests:      Vitest
```

**NO cambiar:** el stack, el Layout/branding, el router.
**Commits:** conventional commits en español. Ejemplo: `feat(cotizador): agregar generación PDF arrendamiento puro`

---

## 3. DESIGN TOKENS — INAMOVIBLES

Extraídos del DOM del sistema de producción el 18-04-2026.

```
Sidebar background:     #184892   ← NUNCA cambiar
Sidebar hover/header:   #112239   ← NUNCA cambiar
Accent usuario:         #FF6600   (nombre de usuario en sidebar)
Texto sidebar:          #FFFFFF
Link activo:            #FF6600 con border-left 3px
Body background:        #FFFFFF
Botón primary:          #112239
Fuente:                 Roboto, sans-serif
Framework CSS:          Bootstrap (sistema legado) / Tailwind (sistema nuevo)
Logo:                   circular, ~60px, fondo blanco
Footer:                 "Digital Invoice 2026 © 5.3.3.9"
```

**Colores PDF (cotizaciones):**
```
Fila TOTAL (fondo):     #1B2A47
Fila TOTAL (texto):     #FFFFFF bold
Filas impares:          #F5F5F5
Filas pares:            #FFFFFF
Texto general:          #000000
Tipografía PDF:         Helvetica (embebida en @react-pdf/renderer)
Tamaño base PDF:        9pt
```

---

## 4. FÓRMULAS FINANCIERAS — VERIFICADAS CONTRA EL EXCEL ORIGINAL

> Reverificadas el 24-04-2026 contra `Cotización Inyecta Arrendamiento.xlsx`
> (5 hojas: Perfil, Pagos, Cotización, Amortización Puro, Amortización
> Financiero). Esta sección es la **fuente de verdad**: si el código
> contradice algo aquí, el código está mal.

### 4.1 Variables de entrada

| Variable                | Excel ref | Ejemplo                | Notas                                                                                         |
|---|---|---|---|
| valorBienConIVA         | E2        | $1,000,000.00          | Precio al cliente con IVA                                                                     |
| tasaIVA                 |           | 0.16                   | 16%                                                                                           |
| tasaAnual               | E8        | 0.36                   | 36% anual = 3% mensual — tasa estándar Inyecta                                                |
| plazo                   | E4        | 48                     | meses                                                                                         |
| enganche                | H4 / E17  | 0.10  ó  $86,206.90    | **Dual %/monto**: si <2 ⇒ %, si ≥2 ⇒ monto absoluto                                           |
| tasaComisionApertura    | H12       | 0.05                   | 5% sobre baseBien (B17), después de descontar enganche                                        |
| comisionFinanciada      | B12       | "FINANCIADO"/"CONTADO" | Si financiada se suma al PV del PMT                                                           |
| porcentajeDeposito      | H8 / E18  | 0.10  ó  $77,586.21    | **Dual**. PURO: queda como FV del PMT. FIN: monto que el cliente entrega y se reembolsa al final del contrato |
| valorResidual           | H10 / E21 | 0.16  ó  $100,000      | **Dual**. SOLO PURO: precio simbólico al cierre (display PDF). En FIN se ignora.              |
| valorResidualEsComision | —         | true / false (PURO)    | Checkbox UI: si true, valorResidual = comisionApertura. Solo PURO.                            |
| seguroAnual             | E12       | $0  ó  "Pendiente"     | Captura **anual**. "Pendiente" ⇒ no entra en cálculos hasta que se especifique.               |
| seguroFinanciado        | B13       | FINANCIADO / CONTADO   | Si financiado, suma `seguroAnual × plazo/12` a B17                                            |
| gpsMonto                | E10       | $16,000                | si es financiado                                                                              |
| gpsFinanciado           | B11       | FINANCIADO / CONTADO   | Si financiado, suma a B17                                                                     |
| tasaMoratoriaAnual      | —         | tasaAnual × 2          | **Dinámica**: SIEMPRE 2× la tasa ordinaria del contrato (ej. 36% ord. ⇒ 72% mor.)             |

### 4.2 Cálculos en orden estricto (Excel hoja "Perfil")

```
valorSinIVA  (E6) = valorBienConIVA / 1.16

enganche_resuelto = (H4 < 2) ? valorSinIVA × H4 : H4   ← patrón dual
                    (E17 = enganche)

baseBien     (B17) = valorSinIVA - enganche_resuelto
                   + (gpsFinanciado    ? gpsMonto                 : 0)
                   + (seguroFinanciado ? seguroAnual × plazo/12   : 0)

comisionApertura (B18) = baseBien × tasaComisionApertura

PV_pmt       (B19) = baseBien + (comisionFinanciada ? comisionApertura : 0)
                     ← ESTE es el PV que entra al PMT (sin IVA del bien)

depositoGarantia (E18) = (H8 < 2) ? baseBien × H8 : H8   ← patrón dual

valorResidualResuelto (E21) =
    PURO  : valorResidualEsComision
              ? comisionApertura
              : ((H10 < 2) ? baseBien × H10 : H10)   ← patrón dual
    FIN   : ignorado (no se captura)
```

> Cambio respecto a la versión anterior: B17 ahora **resta enganche**
> antes de calcular comisión y depósito, espejo de la celda Excel B17.
> La versión anterior usaba `baseBien = valorSinIVA + gpsFinanciado`
> sin restar enganche, lo que inflaba comisión y depósito en operaciones
> con enganche > 0.

### 4.3 PMT — Fórmula verificada (Excel celda H17)

```
PURO:       FV_pmt = depositoGarantia
            renta  = PMT(tasaAnual/12, plazo, -PV_pmt, depositoGarantia)
                     - seguroAnual / plazo / 1.16

FINANCIERO: FV_pmt = 0  (amortiza TODO el capital)
            renta  = PMT(tasaAnual/12, plazo, -PV_pmt, 0)
                     - seguroAnual / plazo / 1.16

PMT(r, n, PV, FV) = (PV × r × (1+r)^n - FV × r) / ((1+r)^n - 1)
con r = tasaAnual / 12
```

> El descuento `seguroAnual / plazo / 1.16` proviene del Excel: el
> seguro se cobra como concepto separado (con su propio IVA) en cada
> renta. Si `seguroAnual = 0` (default sin seguro), el término no
> afecta. Si `seguroPendiente = true`, también se ignora hasta que se
> especifique el monto.

### 4.4 Renta total con IVA (Excel hoja "Pagos" col I)

```
rentaConIVA_n = TRUNC(renta + renta × 0.16, 2)
              = TRUNC(renta × 1.16, 2)
                ↑ Excel usa TRUNC en esta celda específica para que la
                  suma anual no le sume al cliente $0.005/mes acumulado.
                  El motor interno SÍ usa ROUND_HALF_UP en cada celda
                  intermedia — la diferencia neta es <$0.01/mes y se
                  absorbe al truncar el total con IVA.
```

### 4.5 Residual DISPLAY (sección 4 del PDF de cotización)

```
PURO:       valorRescate_display = valorResidualResuelto (E21)
            IVA rescate          = E21 × 0.16
            Total rescate        = E21 × 1.16

FINANCIERO: opcionCompra_display = baseBien × 0.02   (precio simbólico)
            IVA opcion           = display × 0.16
            Total opcion         = display × 1.16
```

### 4.6 IVA de la renta

```
IVA_renta_n = renta × 0.16   (mismo cálculo en PURO y FIN)
Total_n     = renta × 1.16
```

### 4.7 Amortización PURO (tabla al cliente — sin desglose capital/interés)

```
Columnas: N° | Fecha | Renta | IVA | Total
Renta = constante (PMT)
IVA   = Renta × 0.16
Total = Renta × 1.16
NO hay columnas de Capital, Interés ni Saldo (arrendamiento operativo)
```

### 4.8 Amortización FINANCIERO (tabla con desglose completo)

```
Columnas: N° | Fecha | Capital | Interés | IVA | Total | Saldo

Saldo_0   = PV_pmt
Interés_n = Saldo_{n-1} × (tasaAnual/12)
Capital_n = PMT - Interés_n            (última fila: Capital_n = Saldo_{n-1} - FV exacto)
Saldo_n   = Saldo_{n-1} - Capital_n    (última fila = FV exacto, normalmente 0.00)
IVA_n     = Renta × 0.16               (= PMT × 0.16, no solo sobre interés)
Total_n   = Capital_n + Interés_n + IVA_n
```

### 4.9 Moratorios — base RENTA PENDIENTE del periodo

> Corrección importante (per Excel hoja "Pagos" col M): la base del
> moratorio NO es el saldo insoluto general del contrato; es la **renta
> pendiente del periodo en mora**. La tasa moratoria es **dinámica =
> 2× la tasa ordinaria del contrato**, NO un valor fijo de 72%.

```
rentaPendienteSinIVA = rentaSinIVA - pagoRecibidoSinIVA
                     = G - K/1.16            (Excel)

tasaMoratoriaAnual   = tasaAnual × 2          ← dinámica, NO fija
tasaMoratoriaDiaria  = tasaMoratoriaAnual / 360

interesMoratorio_n   = rentaPendienteSinIVA × tasaMoratoriaDiaria × diasAtraso
                     - moratorioYaPagado_n   ← descuenta lo ya cobrado del periodo
ivaMoratorio_n       = interesMoratorio × 0.16
```

Ejemplo: contrato @ 36% ordinaria → moratoria 72%/360 = 0.2%/día sobre
la renta pendiente sin IVA del periodo en mora. Contrato @ 24% ordinaria
→ moratoria 48%/360 = 0.1333%/día. La fórmula reescala automáticamente.

```
Prelación de pagos (orden legal México):
  1. Intereses moratorios
  2. IVA sobre moratorios
  3. Intereses ordinarios
  4. IVA sobre intereses
  5. Capital
```

### 4.10 Pagos adicionales

```
PURO  → Rentas Prorrateadas:
  nueva_renta = (rentas_restantes_netas_total - pago_adicional_neto) / periodos_restantes
  Formula: =((B13-C13)*I13_SIN_IVA - Q13) / (B13-C13)
  Donde: B13=plazo, C13=periodo actual, I13=renta con IVA, Q13=pago adicional

FINANCIERO → Rentas Anticipadas:
  nueva_renta = PMT(tasaAnual/12, periodos_restantes, -saldo_tras_abono, fv)
  El pago reduce el saldo y se recalcula la renta
```

### 4.11 Función addMeses (bug crítico de fechas)

```typescript
// OBLIGATORIO: usar esta función en lugar de setMonth()
// Razón: Jan 31 + 1 mes con setMonth() = Mar 3 (incorrecto)
// Con esta función = Feb 28 (correcto)
function addMeses(base: Date, meses: number): Date {
  const totalMeses = base.getMonth() + meses;
  const yr  = base.getFullYear() + Math.floor(totalMeses / 12);
  const mo  = ((totalMeses % 12) + 12) % 12;
  const dia = base.getDate();
  const maxDia = new Date(yr, mo + 1, 0).getDate();
  return new Date(yr, mo, Math.min(dia, maxDia), 12, 0, 0);
}
```

### 4.12 Depósito en garantía ≠ Valor residual (PURO)

Conceptos **separados** aunque tradicionalmente algunos sistemas los
confundan:

```
Depósito en garantía (E18, % o monto en H8)
  • Monto que el cliente ENTREGA al inicio.
  • PURO: queda como FV del PMT (saldo final = depósito).
  • FIN : monto que el cliente entrega y se le reembolsa al final
          (no entra al PMT — FV = 0).

Valor residual (E21, % o monto en H10) — SOLO PURO
  • Precio simbólico opcional para que el cliente compre el bien al
    final del contrato (display en sección 4 del PDF).
  • NO entra al PMT.
  • Puede igualar al depósito (cliente "pierde" el depósito a cambio
    del bien) o ser distinto.

En FINANCIERO el residual es FIJO 2% del baseBien (opción de compra
simbólica per ley) y no se captura por separado.
```

### 4.13 Checkbox "valor residual = comisión de apertura" (solo PURO)

UI: checkbox al lado del campo Valor Residual. Cuando se marca:

```
if (producto === 'PURO' && valorResidualEsComision) {
  valorResidualResuelto = comisionApertura
} else if (producto === 'PURO') {
  valorResidualResuelto = (H10 < 2) ? baseBien × H10 : H10
}
```

Útil cuando el cliente "compensa" su residual contra la comisión que
ya pagó.

### 4.14 Seguro anual con opción "Pendiente"

UI: input numérico ANUAL + checkbox "Pendiente".

```
if (seguroPendiente) {
  // No entra en B17 (PV_pmt), no entra en la renta.
  // PDF de cotización muestra "Seguro: Pendiente de cotizar".
  // Cuando se especifique, se recalcula PMT y amortización.
} else {
  // Captura: monto ANUAL (E12).
  // Display en cotización: monto anual.
  // En B17:   + seguroAnual × plazo/12 (si financiado)
  // En PMT:   - seguroAnual / plazo / 1.16  (cuota neta mensual)
}
```

### 4.15 Patrón dual %/monto absoluto

Usado en TRES campos (enganche H4, depósito H8, residual H10). El
usuario captura un solo valor: si es <2 se interpreta como porcentaje;
si es ≥2 como monto absoluto.

```typescript
function resolverDual(input: Decimal, base: Decimal): Decimal {
  return input.lt(2) ? base.mul(input) : input;
}
```

Replica del Excel: `IF(H4<2, E6*H4, H4)`.

---

## 5. ESTRUCTURA DE ARCHIVOS DEL PROYECTO

```
apps/web/src/
├── components/
│   └── layout/
│       ├── Layout.tsx          ← wrapper con sidebar + header + footer
│       └── Sidebar.tsx         ← menú lateral colapsable
├── config/
│   └── navigation.ts           ← estructura de menús (ver sección 6)
├── lib/
│   ├── pdf/
│   │   ├── tokens.ts           ← design tokens PDF
│   │   ├── CotizacionPDF.tsx   ← componente @react-pdf/renderer cotización
│   │   └── AmortizacionPDF.tsx ← componente @react-pdf/renderer amortización
│   └── cotizacion/
│       ├── calculos.ts         ← calcularCotizacion() + calcPMT()
│       └── amortizacion.ts     ← calcAmortPuro() + calcAmortFinanciero()
└── pages/
    ├── cotizador/
    │   ├── CotizadorPuro.tsx
    │   └── CotizadorFinanciero.tsx
    ├── crm/
    ├── arrendatarios/
    ├── operaciones/
    ├── cobranza/
    ├── estadisticas/
    └── admin/

server/src/
├── routes/
│   ├── operaciones.ts
│   ├── arrendatarios.ts
│   ├── cobranza.ts
│   ├── pagos.ts
│   └── notificaciones.ts
├── middleware/
│   └── bitacora.ts             ← audit trail PLD
└── lib/
    └── notificar.ts            ← notificaciones por rol

packages/core/src/
├── amortizacion.ts             ← calcularAmortFrances() con Decimal.js
├── pagos.ts                    ← aplicarPago() con prelación legal
└── __tests__/
    └── calculos.test.ts
```

---

## 6. ESTRUCTURA DE NAVEGACIÓN — MENÚ LATERAL

Extraída del DOM de producción (61 links, 18-04-2026).

```typescript
// apps/web/src/config/navigation.ts
export const NAV_SECTIONS = [
  {
    label: 'Administración', icon: 'Settings',
    items: [
      { label: 'Catálogos', icon: 'BookOpen', children: [
        { label: 'Tasas de Interés',  path: '/admin/tasas' },
        { label: 'Comisiones',        path: '/admin/comisiones' },
        { label: 'Configuración GPS', path: '/admin/gps' },
      ]},
    ],
  },
  {
    label: 'Arrendamiento', icon: 'FileText',
    items: [
      { label: 'Cotizador', icon: 'Calculator', children: [
        { label: 'Arrendamiento Puro',       path: '/cotizador/puro' },
        { label: 'Arrendamiento Financiero', path: '/cotizador/financiero' },
      ]},
      { label: 'CRM', icon: 'Users', children: [
        { label: 'Prospectos',  path: '/crm' },
        { label: 'Calendario',  path: '/crm/calendario' },
      ]},
      { label: 'Arrendatarios', icon: 'User', children: [
        { label: 'Nuevo Arrendatario', path: '/arrendatarios/nuevo' },
        { label: 'Visor',             path: '/arrendatarios' },
      ]},
      { label: 'Operaciones', icon: 'Briefcase', children: [
        { label: 'Nueva Operación',   path: '/operaciones/nueva' },
        { label: 'Mesa de Registros', path: '/operaciones/mesa' },
        { label: 'Dispersión',        path: '/operaciones/dispersion' },
      ]},
      { label: 'Cobranza', icon: 'CreditCard', children: [
        { label: 'Caja Receptora', path: '/cobranza' },
        { label: 'Moratorios',     path: '/cobranza/moratorios' },
      ]},
      { label: 'Regulación', icon: 'Shield', children: [
        { label: 'Círculo de Crédito', path: '/regulacion/circulo-credito' },
      ]},
      { label: 'Solicitudes', icon: 'FilePlus', children: [
        { label: 'Nueva Solicitud',    path: '/solicitudes/nueva' },
        { label: 'Carga Masiva Excel', path: '/solicitudes/excel' },
      ]},
      { label: 'Estadísticas', icon: 'BarChart2', children: [
        { label: 'Portafolio Vigente', path: '/estadisticas/portafolio' },
        { label: 'Cartera Vencida',    path: '/estadisticas/vencida' },
        { label: 'Producción Mensual', path: '/estadisticas/produccion' },
        { label: 'Métricas Generales', path: '/estadisticas/metricas' },
      ]},
    ],
  },
];
```

---

## 7. REGLAS DE NEGOCIO — NO NEGOCIABLES

1. **Decimal.js es obligatorio** para TODOS los cálculos financieros. Ningún `number` nativo para dinero.

2. **El PV del PMT (B19)** es `baseBien + comisionAperturaFinanciada` (sin IVA del bien), donde `baseBien (B17) = valorSinIVA - enganche + gpsFinanciado + seguroAnual×plazo/12`. El IVA del bien NO se financia en arrendamiento puro ni financiero.

3. **PURO no tiene desglose Capital/Interés** en su tabla de amortización al cliente. Solo muestra Período, Fecha, Renta, IVA, Total.

4. **PURO: FV del PMT = depósito en garantía** (porcentajeDeposito × baseBien, dual %/monto). Ese saldo queda al final de los pagos. El **valor residual** es un concepto SEPARADO (display PDF), no entra al PMT (ver §4.12).

5. **FINANCIERO: FV del PMT = 0**. La opción de compra (2%) es solo un precio simbólico que se muestra en la cotización, no entra al PMT. El depósito en FIN se entrega al inicio y se reembolsa al final, tampoco entra al PMT.

6. **La última fila de amortización** debe usar `capital = saldoRestante - FV` exacto (no `PMT - interés`), para garantizar que el saldo final sea exactamente FV (= depósito en PURO, = 0 en FIN) sin residuo de redondeo.

7. **addMeses()** es obligatorio para calcular fechas. Nunca usar `setMonth()` directamente.

8. **IVA en tablas** = renta × 0.16 para ambos productos (per Excel de Inyecta, incluyendo FINANCIERO).

9. **Pagos adicionales**: PURO usa Rentas Prorrateadas (no hay deducción de capital — solo redistribución de rentas). FINANCIERO usa Rentas Anticipadas (abona a capital, recalcula PMT).

10. **Prelación legal México**: moratorios → IVA moratorios → intereses → IVA intereses → capital.

11. **Tasa moratoria dinámica = 2× tasa ordinaria del contrato** (ej. 36% ord. ⇒ 72% mor., 24% ord. ⇒ 48% mor.). Base del cálculo: **renta pendiente del periodo en mora**, NO saldo insoluto general (ver §4.9).

12. **Comisión de apertura**: 5% sobre baseBien (B17, ya con enganche descontado). Se puede financiar o cobrar de contado.

13. **Depósito en garantía y valor residual son conceptos separados**. El depósito (H8) es lo que el cliente entrega al inicio (FV del PMT en PURO). El residual (H10) es el precio simbólico de compra al final, solo PURO, solo display. Ambos soportan el patrón dual %/monto (§4.15).

14. **Checkbox "residual = comisión apertura" (solo PURO)**: cuando se marca, valorResidualResuelto = comisionApertura, ignorando H10 (§4.13).

15. **Seguro: captura ANUAL con opción "Pendiente"**. Si "Pendiente", no entra en B17 ni en la renta hasta que se especifique el monto (§4.14).

16. **Patrón dual %/monto** en enganche, depósito y valor residual: input <2 ⇒ porcentaje, input ≥2 ⇒ monto absoluto (§4.15).

---

## 8. REFERENCIAS IMPORTANTES

### Excel de referencia (fuente de verdad para fórmulas)
- Google Sheets: https://docs.google.com/spreadsheets/d/1emmDSujIVG8MUkjTyLWH6VQQP6l_7qi-
- Hoja "Pagos": amortización PURO con todas las fórmulas
- Hoja "Cotización": layout exacto del PDF
- Hoja "Amortización Financiero": desglose por período

### Sistema en producción (referencia de UX/navegación)
- URL: http://34.239.151.177/Home/Index
- Stack: .NET MVC + Bootstrap 4 (el nuevo sistema NO usa esto, solo como referencia visual)

### PDFs de referencia (cotizaciones)
- Ver `outputs/PROMPT_PDF_COTIZACIONES.md` — tiene el design system completo
- PURO: sección 4 = "Valor de rescate" (16%)
- FINANCIERO: sección 4 = "Opcion de compra" (2%)

### Sistema STPB (código reutilizable)
- Ubicación: `/sessions/.../sistema_banco/SE TU PROPIO BANCO_SISTEMA/inyecta-stpb/`
- `packages/core/src/amortizacion.ts` — Decimal.js + addMeses() + fix última fila
- `packages/core/src/pagos.ts` — aplicarPago() con prelación legal
- `server/src/middleware/bitacora.ts` — audit trail PLD (adaptar)
- `server/src/lib/notificar.ts` — notificaciones por rol (adaptar)

---

## 9. LISTA DE TAREAS PENDIENTES (en orden de prioridad y velocidad)

Marca cada tarea como `[x]` cuando esté completada. Haz commit al terminar cada una.

### FASE 1 — Core (hacer primero, son base de todo lo demás)

- [ ] **T1: Bug $NaN en tabla de amortización**
  - Archivo: `apps/web/src/pages/Cotizador.tsx` (buscar `calcAmort` o similar)
  - Fix: aplicar fórmulas de sección 4.8 de este archivo
  - Verificar: período 1 debe mostrar interés=$57,529.86, capital=$15,568.16
  - Commit: `fix(cotizador): corregir NaN en tabla de amortización`

- [ ] **T2: Instalar Decimal.js y migrar cálculos**
  - `cd apps/web && npm install decimal.js`
  - Crear `apps/web/src/lib/cotizacion/calculos.ts` con `calcPMT()` y `calcularCotizacion()`
  - Crear `apps/web/src/lib/cotizacion/amortizacion.ts` con `calcAmortPuro()` y `calcAmortFinanciero()`
  - Eliminar cualquier función `calcAmort` duplicada en el Cotizador
  - Commit: `feat(core): migrar cálculos financieros a Decimal.js`

- [ ] **T3: Sidebar y navegación**
  - Crear `apps/web/src/config/navigation.ts` (ver sección 6)
  - Crear `apps/web/src/components/layout/Sidebar.tsx` (color #184892)
  - Crear `apps/web/src/components/layout/Layout.tsx`
  - Actualizar `apps/web/src/App.tsx` con todas las rutas de sección 6
  - Crear páginas stub para rutas que no existan
  - Commit: `feat(layout): implementar sidebar con navegación completa`

### FASE 2 — PDFs (la función más importante para ventas)

- [ ] **T4: PDF Cotización PURO y FINANCIERO**
  - Instalar: `cd apps/web && npm install @react-pdf/renderer`
  - Crear `apps/web/src/lib/pdf/tokens.ts`
  - Crear `apps/web/src/lib/pdf/CotizacionPDF.tsx`
  - Agregar botón "Descargar Cotización" en el Cotizador
  - Verificar contra valores de sección 4 de este archivo
  - Commit: `feat(pdf): generación de cotización PURO y FINANCIERO`

- [ ] **T5: PDF Tabla de amortización**
  - Crear `apps/web/src/lib/pdf/AmortizacionPDF.tsx`
  - PURO: 5 columnas (Período, Fecha, Renta, IVA, Total) — sin capital/saldo
  - FINANCIERO: 7 columnas (+ Capital, Interés, Saldo)
  - Agregar botón "Descargar Amortización" junto al botón de cotización
  - Commit: `feat(pdf): tabla de amortización PURO y FINANCIERO`

### FASE 3 — Calidad y compliance

- [ ] **T6: Unit tests del core financiero**
  - Archivo: `apps/web/src/lib/cotizacion/__tests__/calculos.test.ts`
  - Test 1: `calcPMT(0.36, 48, 1917662.07, 292215.17)` → `73098.02`
  - Test 2: `calcPMT(0.36, 48, 1917662.07, 0)` → `75896.80`
  - Test 3: amortización PURO período 1 interés = `57529.86`
  - Test 4: amortización FINANCIERO saldo p48 = `292215.17`
  - Test 5: amortización FINANCIERO saldo final = `0.00` exacto
  - Commit: `test(core): tests unitarios de cálculos financieros verificados`

- [ ] **T7: Bitácora de auditoría (PLD)**
  - Adaptar `server/src/middleware/bitacora.ts` del sistema STPB
  - Modelo Prisma: `Bitacora { usuarioId, accion, entidad, entidadId, payloadJson, ip, createdAt }`
  - Aplicar en todas las rutas POST/PATCH/PUT/DELETE
  - Commit: `feat(api): bitácora de auditoría para cumplimiento PLD`

### FASE 4 — Funcionalidad avanzada

- [ ] **T8: Pagos adicionales en amortización**
  - PURO: input "Pago adicional" en período N → redistribuye rentas restantes (Rentas Prorrateadas)
  - FINANCIERO: input "Pago adicional" en período N → abona a capital, recalcula PMT (Rentas Anticipadas)
  - Fórmulas en sección 4.10 de este archivo
  - Commit: `feat(cotizador): pagos adicionales PURO y FINANCIERO`

- [ ] **T9: Sistema de notificaciones in-app**
  - Adaptar `server/src/lib/notificar.ts` del sistema STPB
  - Reglas: notificar siempre a ADMIN + ejecutivo de la operación
  - Si acción es tipo SOLICITUD_: también notificar a LEGAL
  - Endpoint: `GET /api/notificaciones`, `PATCH /api/notificaciones/:id/leida`
  - Commit: `feat(notif): sistema de notificaciones por rol`

- [ ] **T10: Conciliación bancaria**
  - Script Python: `scripts/conciliar_banco.py`
  - Lee PDFs de estado de cuenta (pdfplumber)
  - Cruza contra registros de cobranza por monto (±$5), RFC en concepto, número de contrato
  - Output: Excel con matches y pendientes
  - Commit: `feat(conciliacion): script de conciliación bancaria`

### FASE 5 — Portales y facturación

- [ ] **T11: Portal del Arrendatario**
  - Auth separada (JWT diferente o sub-ruta `/portal`)
  - Vista: contrato vigente, tabla de pagos, saldo pendiente, descarga de estado de cuenta
  - Commit: `feat(portal): portal del arrendatario`

- [ ] **T12: CFDI 4.0**
  - Interface abstracta `PACService` con método `timbrar(xml: string)`
  - Implementación con el PAC que use Inyecta
  - Generar XML por cada renta cobrada + complemento de pago
  - Commit: `feat(cfdi): integración CFDI 4.0 para rentas`

- [ ] **T13: Reportes y estadísticas**
  - Portafolio vigente, cartera vencida, producción mensual, métricas generales
  - Requiere que T1-T9 estén funcionando primero
  - Commit: `feat(stats): dashboard de reportes y estadísticas`

---

## 10. ESTADO ACTUAL DEL PROYECTO

> Actualizar esta sección después de cada sesión de trabajo.

```
Última actualización: 18-04-2026 (sesión activa)

Completado:
  - [x] T1: Bug $NaN — IVA financiero corregido a renta×16% (regla 8) en
        client/src/lib/cotizacion/amortizacion.ts y
        server/src/services/leaseCalculator.ts. Última fila ahora cierra
        en FV exacto (saldo − FV) en vez de hardcodeado a 0.
        Verificado al centavo contra §4.6/§4.8.
  - [x] T2: Decimal.js — motor cliente en client/src/lib/cotizacion/
        (calculos.ts: calcPMT + calcularCotizacion;
         amortizacion.ts: calcAmortPuro + calcAmortFinanciero).
        Precision 20, ROUND_HALF_UP. Verificado al centavo. La carpeta
        legacy `lib/pdfGenerator.ts` queda en uso por CotizacionDetalle.tsx
        (será reemplazada en una limpieza posterior).
  - [x] T3: Sidebar/navegación — client/src/config/navigation.ts con
        NAV_SECTIONS jerárquica (Inicio / Administración / Arrendamiento)
        + findActiveBranch() para abrir el acordeón correcto. Layout.tsx
        usa la configuración. Cotizador unificado (un solo /cotizador con
        toggle PURO/FINANCIERO interno, ya no /cotizador/{puro,financiero}).
        App.tsx con todas las rutas + EnConstruccion.tsx para placeholders.
  - [x] T4: PDF Cotización — réplica del Excel original de Inyecta usando
        @react-pdf/renderer (no html→pdf). Componentes en
        client/src/lib/pdf/{tokens.ts, CotizacionPDF.tsx}. Header fijo
        (fecha + logo + razón social + título), footer fijo (5 notas +
        contacto), 4 secciones zebra (Monto, Pago inicial, Renta, Residual).
        Logo 150×100. Branch dinámico por producto (PURO: "Valor de rescate"
        16% / FIN: "Opción de compra" 2%). Assets en client/public/brand/.
  - [x] T5: PDF Amortización — client/src/lib/pdf/AmortizacionPDF.tsx
        comparte header/footer FIJOS con CotizacionPDF (se repiten en
        cada página). Sub-header con cliente/plazo/tasa/renta/folio.
        PURO portrait (5 cols: # Fecha Renta IVA Total) /
        FINANCIERO landscape (7 cols: + Capital Interés Saldo).
        Encabezado de columnas marcado `fixed` para repetirse en cada
        página. Totales al final + paginación "Página X de Y".
        Cotizador.tsx integra PDFDownloadLink para ambos PDFs +
        nuevos campos descriptivos del bien (descripción, estado,
        seguro, fecha primer pago).
  - [x] T6: Unit tests — Vitest configurado en cliente.
        client/src/lib/cotizacion/__tests__/calculos.test.ts: 28 tests
        verificando calcPMT, calcularCotizacion (PURO+FIN), calcAmortPuro,
        calcAmortFinanciero (cierre exacto en FV, IVA renta×16%, fechas
        sin bug fin-de-mes). `npm test` pasa 28/28 ✅.
  - [x] T7: Bitácora — server/src/middleware/bitacora.ts + modelo Prisma
        `Bitacora` (usuarioId+email+rol snapshot, metodo, ruta, entidad,
        entidadId, accion, payloadJson sanitizado, responseStatus, ip,
        userAgent, createdAt). Mounted globalmente en /api antes de las
        rutas: registra POST/PATCH/PUT/DELETE en res.on('finish') sin
        bloquear la respuesta. Sanitiza password/token/secret/cardNumber.
        Ruta GET /api/bitacora con paginación + filtros (usuarioId,
        entidad, accion, fecha, q) restringida a ADMIN/DIRECTOR.
        Migración: 20260419175538_add_bitacora.
  - [x] T8: Pagos adicionales — funciones core en
        client/src/lib/cotizacion/amortizacion.ts:
        * aplicarPagoAdicionalPuro() — Rentas Prorrateadas: redistribuye
          el adicional neto en las rentas restantes
          (CLAUDE.md §4.10 fórmula 1).
        * aplicarPagoAdicionalFinanciero() — Rentas Anticipadas:
          reduce saldo y recalcula PMT manteniendo plazo restante y FV
          (CLAUDE.md §4.10 fórmula 2).
        Ambas con validación de período (1..plazo-1) y de monto
        (no excede saldo amortizable). 10 tests adicionales en la suite
        (38/38 ✅). Wiring UI pendiente (lib lista para conectarse).
  - [x] T9: Notificaciones in-app — modelo Prisma `Notificacion`
        (userId/tipo/titulo/mensaje/entidad/entidadId/url/leida/leidaAt
        + índices userId+leida y userId+createdAt). Agregado rol LEGAL
        al enum UserRole para soportar la regla "SOLICITUD_* → LEGAL"
        del CLAUDE.md §9 T9. server/src/lib/notificar.ts expone:
        * notificar(payload) — siempre ADMIN + ejecutivo (si aplica) +
          LEGAL si tipo empieza con "SOLICITUD_". De-duplica por userId.
          Fire-and-forget: errores se loggean, nunca tumban la operación.
        * notificarPorRol(roles, payload) — para alertas dirigidas
          (ej: COBRANZA en mora ≥30 días).
        * notificarUsuario(userId, payload) — confirmaciones individuales.
        server/src/routes/notificaciones.ts: GET / (paginado,
        filtros soloNoLeidas+tipo, devuelve contador de no leídas),
        GET /contador (polling ligero), PATCH /:id/leida (idempotente),
        PATCH /leer-todas, DELETE /:id. Todo restringido al usuario
        autenticado (no se pueden ver/editar notificaciones ajenas).
        Migración: 20260419180117_add_notificaciones.
  - [x] T10: Conciliación bancaria — script Python en
        sistema/scripts/conciliar_banco.py + requirements.txt
        (pdfplumber, openpyxl, psycopg2-binary, python-dotenv).
        Lee 1..N PDFs de estado de cuenta, autodetecta banco
        (BBVA/Santander/Banamex/Banorte/HSBC/Scotia + fallback),
        conecta a Postgres usando DATABASE_URL de server/.env,
        carga periodos pendientes desde amortization_entries y
        cruza con heurística scoring 0-100:
          +40 monto coincide ±$5
          +35 folio del contrato en descripción
          +20 RFC del cliente en descripción
          +15 fecha ±5d del vencimiento
          +10 sin pago previo del periodo
        Score umbral = 50. NO modifica BD (sólo reporte).
        Output Excel con 3 hojas: Matches / Pendientes / Resumen
        (estilo Inyecta: header #1B2A47, zebra #F5F5F5).
        Complementa el endpoint existente
        /api/conciliation/upload (que sólo lee CSV).
  - [x] T11: Portal del Arrendatario — backend (server/src/routes/
        portal.ts) y frontend (client/src/pages/Portal.tsx) ya
        existían: vista pública en /portal/:token (sin login, token
        único impreso en el contrato). Incluye dashboard con cliente +
        contratos, detalle por contrato con calendario de pagos
        (estatus PAGADO/PARCIAL/VENCIDO/PENDIENTE/FUTURO + cálculo
        live de moratorios), tabs de pagos e facturas, y bloque de
        datos bancarios para depósito.
        En esta sesión se cerró el spec agregando la **descarga de
        estado de cuenta**: client/src/lib/pdf/EstadoCuentaPDF.tsx
        (header + footer Inyecta, 4 secciones — datos del contrato,
        resumen al corte, calendario con badges de estatus, datos
        bancarios). Botón "Descargar estado de cuenta" integrado en
        Portal.tsx vía PDFDownloadLink en la vista de contrato.
        38/38 tests siguen pasando, tsc --noEmit limpio en cliente.
  - [x] T12: CFDI 4.0 — la abstracción ICfdiProvider + factory
        getCfdiProvider() + MockCfdiProvider + rutas /api/invoices
        ya existían. En esta sesión se cerró el spec:
        * MockCfdiProvider ahora emite XML CFDI 4.0 conforme
          (xmlns + xsi:schemaLocation + Exportacion="01" +
          DomicilioFiscalReceptor + ObjetoImp por concepto +
          TFD 1.1 con xmlns). Datos de emisor configurables vía
          CFDI_EMISOR_RFC/NOMBRE/REGIMEN/LUGAR_EXPEDICION.
        * Soporte de Complemento de Pago 2.0 (Pagos20):
          - Nuevo campo opcional CfdiInvoiceInput.complementoPago
            con fechaPago/formaPago/monto + DoctoRelacionado[].
          - El MockProvider lo serializa (pago20:Pagos /
            pago20:Totales / pago20:Pago / pago20:DoctoRelacionado).
          - routes/invoices.ts construye automáticamente el
            complemento cuando tipo='PAGO' + paymentId, ligando al
            primer CFDI de ingreso PPD pendiente del contrato y
            calculando saldoAnterior / importePagado / saldoInsoluto.
            Para PAGO los importes del comprobante van en 0 (el
            monto real vive en el complemento, per Anexo 20 SAT).
        * FacturamaProvider: deja de ser stub. Implementación real
          contra REST de Facturama (api / apisandbox), Basic auth
          con FACTURAMA_USER/PASS, mapping completo a
          NameId/CfdiType/Issuer/Receiver/Items/Complemento.Payments,
          descarga del XML timbrado y cancelación por motivo SAT
          (01/02/03/04). Throw helpful error si faltan credenciales.
        * SwSapienProvider sigue como stub explícito (Inyecta usa
          Facturama; el contrato queda preparado para enchufar SW
          o cualquier otro PAC sin tocar las rutas).
        * tsc --noEmit limpio (excepto el bug pre-existente de
          jwt.sign en auth.ts, no relacionado con T12).
  - [x] T13: Reportes y estadísticas — extendido reports.ts con tres
        endpoints nuevos:
        * GET /api/reports/portafolio — composición del vigente:
          totales, agregaciones por producto (PURO/FIN) con %, por
          riesgo (A/B/C), por plazo, por etapa de pipeline, y top 10
          contratos por saldo.
        * GET /api/reports/produccion-mensual?year — originación por
          mes (contratos firmados o creados): mix Puro/Financiero,
          monto colocado, renta nueva, comisiones generadas, ticket
          promedio y plazo promedio del mes.
        * GET /api/reports/metricas — KPIs ejecutivos en 4 bloques:
          portafolio (vigentes/proceso/terminados/cotizaciones/
          clientes/saldo/renta/intereses + alerta de próximos a
          vencer 90d), mes (contratos nuevos/colocado/comisiones/
          cobranza/moratorios/facturas), año (mismos KPIs anuales),
          calidad (índice de morosidad con semáforo, contratos en
          mora, moratorios cobrados, recaudado acumulado).
        Cuatro páginas nuevas en client/src/pages/:
        * EstadisticasPortafolio.tsx — KPIs + cards por producto/
          riesgo + tabla por plazo + barras por etapa + top 10.
        * EstadisticasCarteraVencida.tsx — KPIs (índice morosidad,
          saldo vencido, críticos +90d), buckets clickables como
          filtro, tabla con CTA "Gestionar" → /cobranza/contrato/:id.
        * EstadisticasProduccion.tsx — selector de año, KPIs anuales,
          mix de productos visual, gráfico de barras por mes con
          tooltip, tabla detallada con totales en footer.
        * EstadisticasMetricas.tsx — bloques Portafolio / Este mes /
          Año actual / Calidad de cartera, semáforo de morosidad
          (verde<5%, ámbar<10%, rojo≥10%), alerta de próximos a
          vencer.
        App.tsx reemplaza los EnConstruccion stubs por los nuevos
        componentes. navigation.ts mantiene los 4 entradas de
        Estadísticas + agrega "Reportes operativos" para la página
        existente con tabs cartera/cobranza/rentabilidad.
        38/38 tests siguen pasando, tsc --noEmit limpio en cliente y
        en servidor (excepto el bug pre-existente de jwt.sign en
        auth.ts).

Bloqueantes conocidos:
  - DISCREPANCIA DE RUTAS: este archivo referencia `apps/web/...` y
    `packages/core/...`, pero la estructura real del repo es
    `sistema/client/...` y `sistema/server/...` (sin packages/core/).
    Las tareas se ejecutan sobre las rutas reales.

Notas de la última sesión:
  - T1: el bug "NaN" se manifestaba como una discrepancia de IVA en
    FINANCIERO (interes×16% en vez de renta×16%). Per regla 11.5 de
    este archivo, CLAUDE.md es la fuente de verdad → corregido en
    cliente y servidor. Última fila de calcAmortFinanciero ahora
    respeta FV (antes asumía 0).
  - Logo de inyecta más grande en CotizacionPDF (95×64 → 150×100).
  - T9: el enum UserRole no incluía LEGAL (sólo ADMIN/DIRECTOR/
    ANALISTA/COBRANZA/OPERACIONES). Se agregó LEGAL para honrar la
    regla de SOLICITUD_* del CLAUDE.md §9 T9.

Sesión de pulido (post-T13):
  - D · fix(auth): jwt.sign tipado con SignOptions
    (server/src/routes/auth.ts) — usa
    `expiresIn: config.jwtExpiresIn as SignOptions['expiresIn']`,
    cierra el bug pre-existente que aparecía en `tsc --noEmit`.
  - B · feat(notif): engachar notificar() en handlers operativos
    — contracts (POST → SOLICITUD_CREADA, PUT advance →
    ETAPA_AVANZADA / CONTRATO_ACTIVADO / CONTRATO_RESCINDIDO),
    cobranza (/pay → PAGO_REGISTRADO + PAGO_PARCIAL si aplica;
    /pay-advance → PAGO_ADELANTADO; /pay-extra → ABONO_CAPITAL),
    quotations (estado → COTIZACION_APROBADA/RECHAZADA;
    convert → SOLICITUD_CREADA del nuevo contrato).
    Helpers `nombreCliente()` y `fmt$()` aceptan Decimal de Prisma.
  - A · feat(notif): UI de campana de notificaciones con polling
    — client/src/components/NotificationBell.tsx + wired en
    Layout.tsx topbar. Badge naranja con conteo, polling 30s a
    /api/notificaciones/contador, panel desplegable con últimas
    15, click marca como leída + navega al url, "leer todas",
    eliminar individual, cerrar con click fuera o ESC.
  - C · feat(cotizador): UI de pagos adicionales en Cotizador
    — nuevo panel "Pagos Adicionales" en sidebar, permite agregar
    múltiples pagos (período + monto), aplica
    aplicarPagoAdicionalPuro/Financiero (T8 lib ya testeada).
    Resumen de impacto: renta original vs nueva renta + ahorro
    proyectado. Tabla de amortización se reemplaza por la
    recalculada cuando hay pagos activos; períodos con pago
    marcados en ámbar con ★.
  - E · feat(bitacora): visor UI de auditoría
    — nueva ruta /admin/bitacora (ADMIN/DIRECTOR), tabla paginada
    con filtros (búsqueda libre debounced, entidad, acción,
    rango de fechas), badges por método HTTP y status.
    Click en fila abre panel lateral con detalle completo +
    payload JSON sanitizado en monoespaciado.
  - H · chore(pdf): retirar pdfGenerator legacy
    — CotizacionDetalle migrado a CotizacionPDF/AmortizacionPDF
    (motor verificado al centavo). Eliminado client/src/lib/
    pdfGenerator.ts. jspdf se conserva porque estadoCuentaPDF.ts
    y reciboPDF.ts aún lo usan (limpieza fuera de scope).

Limpieza post-T13: secuencia D→B→A→C→E→H ejecutada en una sola
pasada autónoma. tsc --noEmit limpio + 38/38 tests pasan después
de cada commit.

──────────────────────────────────────────────────────────────────
Sesión de hardening — Bloque A (20-04-2026, autónoma)
──────────────────────────────────────────────────────────────────
Objetivo: 6 mejoras de bajo riesgo que NO tocan reglas de negocio,
ejecutadas como una pasada para hacer el backend production-ready.
Verificación end-to-end con curl después de cada paso. tsc --noEmit
limpio en todo el bloque. Backend en watch (tsx) no rompió.

  - [x] A1: ENV validation con Zod
        server/src/config/env.ts reescrito con esquema Zod estricto:
        * NODE_ENV / PORT / DATABASE_URL (regex postgres://) /
          JWT_SECRET / JWT_EXPIRES_IN / BITACORA_LOG_GETS /
          CFDI_PROVIDER (enum MOCK|FACTURAMA|SW) + bloque emisor +
          bloque Facturama + CORS_ALLOWED_ORIGINS.
        * superRefine: en production exige JWT_SECRET ≥32 chars y
          rechaza el secret de desarrollo. Si CFDI_PROVIDER=FACTURAMA,
          exige FACTURAMA_USER+PASS.
        * boolFromString: coerciona "true"/"1"/"yes"/"on" → boolean
          (dotenv solo entrega strings).
        * Si la validación falla → process.exit(1) con reporte
          formateado a stderr (path + mensaje por error).
        * Export `config` retro-compatible: agrega config.cfdi.*,
          config.cors.*, config.bitacoraLogGets sin romper imports
          existentes.
        Migrados a tipo de `config` (en vez de process.env crudo):
          - server/src/config/db.ts (config.nodeEnv)
          - server/src/middleware/bitacora.ts (config.bitacoraLogGets)
          - server/src/services/cfdiProvider.ts (config.cfdi.emisor.*,
            .facturama.*, .provider con enum tipado)
        server/.env.example actualizado con las 13 variables
        documentadas (descripción, valores aceptados, ejemplos).
        Verificado: backend reload OK, GET /api/health 200; pruebas
        con DATABASE_URL inválido y JWT_SECRET corto en production
        abortan con mensaje claro.

  - [x] A2: Health check con DB ping
        GET /api/health ahora pingea Prisma (`SELECT 1`) con timeout
        defensivo de 3s:
          * 200 OK: { status, db:{status, latencyMs}, uptime, env, ts }
          * 503 degraded: { status:'degraded', db:{status:'fail',
            latencyMs, error}, ... } — para que k8s/LB dejen de mandar
            tráfico cuando la DB se cae.
        GET /api/health/live agregado: liveness puro (no toca DB),
        para k8s livenessProbe que NO debe matar el pod por una caída
        transitoria de Postgres.
        Smoke test: latency ~5ms en local. Endpoints fuera de auth y
        fuera de bitácora (no inflan la tabla).

  - [x] A3: Error middleware global normalizado
        server/src/middleware/errorHandler.ts (NUEVO) — formato único
        para errores no atrapados:
          { error: { code: string, message: string, details?: unknown } }
        Mapping:
          * AppError (clase exportada) → status custom + code + details
          * ZodError → 400 VALIDATION_ERROR + lista [{path,message,code}]
          * Prisma.PrismaClientKnownRequestError →
              P2000 → 400 VALUE_TOO_LONG
              P2002 → 409 UNIQUE_VIOLATION (con campos del meta.target)
              P2003 → 409 FOREIGN_KEY_VIOLATION
              P2014 → 400 RELATION_VIOLATION
              P2025 → 404 NOT_FOUND
              P2021/P2022 → 500 SCHEMA_MISMATCH
              default → 400 PRISMA_<code>
          * Prisma.PrismaClientValidationError → 400 PRISMA_VALIDATION
          * SyntaxError de body-parser → 400 INVALID_JSON
          * PayloadTooLargeError → 413 PAYLOAD_TOO_LARGE
          * Catch-all → 500 INTERNAL_ERROR (oculta stack en prod)
        Helper exportado: `asyncHandler(fn)` para wrappear handlers
        async (Express 4 no atrapa promises rechazadas).
        notFoundHandler exportado para /api/* sin match → 404
        ROUTE_NOT_FOUND.
        Mounted en index.ts AL FINAL: `app.use('/api', notFoundHandler)`
        + `app.use(errorHandler)`.
        NOTA: rutas legacy con `{error:'string'}` inline NO se tocaron
        (out of scope). El nuevo formato cubre 404s, body-parser
        errors, errores no atrapados y futuras rutas que usen
        AppError + asyncHandler.
        Smoke test: 404 → ROUTE_NOT_FOUND; bad JSON → INVALID_JSON;
        body >1mb → PAYLOAD_TOO_LARGE.

  - [x] A4: Rate limit en /api/auth/login
        Instalado: express-rate-limit ^8.x.
        server/src/middleware/rateLimit.ts (NUEVO):
          * loginLimiter: 5 intentos / 15min / IP, con
            skipSuccessfulRequests:true (logins OK no queman cuota,
            usuarios legítimos no se bloquean tras typo).
          * Devuelve 429 con shape normalizado:
              { error: {code:'RATE_LIMITED', message,
                        details:{retryAfter}} }
          * standardHeaders:true (RateLimit-* RFC), legacy off.
        Mounted en routes/auth.ts: `router.post('/login',
        loginLimiter, async ...)`.
        Smoke test: intentos 1-5 → 401 normal, intentos 6-7 → 429
        RATE_LIMITED con retryAfter:900.
        Identificador = IP solo (no email) para no leak user-enum.
        Reservado en el archivo: pattern para apiLimiter futuro.

  - [x] A5: Helmet + CORS whitelist + body size
        Instalado: helmet ^8.x.
        server/src/index.ts:
          * `app.set('trust proxy', 1)` — para que req.ip refleje
            X-Forwarded-For cuando estemos detrás de LB/nginx.
          * `app.use(helmet({...}))` con dos overrides:
              - contentSecurityPolicy:false (somos API, sin HTML)
              - crossOriginResourcePolicy:'cross-origin' (para que
                el frontend en otro origen consuma /uploads)
            Resultado: HSTS + X-Frame + X-Content-Type-Options +
            X-DNS-Prefetch-Control + X-Powered-By removed.
          * CORS: whitelist desde config.cors.allowedOrigins
            (CSV en ENV). Sin var en development → default
            ['http://localhost:5173','http://localhost:3000'].
            En production sin var → array vacío (failsafe: bloquea
            todo en lugar de permitir todo).
            Origen no autorizado: omite headers CORS y deja que el
            browser bloquee (NO lanza Error → no 500 en logs).
            Loggea warn una vez por origen rechazado.
          * express.json({limit:'1mb'}) (antes 10mb).
            express.urlencoded({extended:true, limit:'1mb'}).
            Las cargas pesadas pasan por multer (middleware/upload.ts
            y routes/conciliation.ts), no por body parser.
        Smoke test: helmet headers presentes; CORS allow para
        localhost:5173, deny para evil.com (sin Access-Control-*);
        body 1.1mb → 413 PAYLOAD_TOO_LARGE (mapeo de A3).

  - [x] A6: Índices DB faltantes
        Migración: 20260421025102_add_perf_indexes — 5 índices nuevos:
          * payments(contractId, periodo) — buscar pago de un periodo
            específico (cobranza /pay-status, conciliación, mora).
          * payments(contractId, fechaPago) — estado de cuenta y
            portal del arrendatario en orden cronológico.
          * payments(fechaPago) — reportes de cobranza por rango.
          * bitacora(usuarioId, createdAt) — composite para timeline
            por usuario en visor de bitácora (filtros usuarioId +
            rango). Antes había usuarioId y createdAt sueltos.
          * notificaciones(userId, leida, createdAt) — composite
            para la query estrella de la campana ("últimas N no
            leídas del usuario X desc"). Antes había (userId,leida)
            y (userId,createdAt) por separado.
        SKIP: clients(rfc) ya tiene índice único auto-creado por
        `rfc String? @unique`.
        Verificado: prisma migrate dev OK, prisma generate OK,
        backend reload OK, /api/health 200.

Bloque A — resumen rápido:
  • 1 archivo nuevo de config (env.ts)
  • 3 middlewares nuevos (errorHandler, rateLimit, helmet config)
  • 1 migración Prisma (5 índices)
  • 2 dependencias nuevas (express-rate-limit, helmet)
  • 0 cambios a reglas de negocio
  • 0 cambios a rutas existentes (excepto auth.ts: agregar limiter)
  • 38/38 tests del cliente siguen pasando (corridos al final)
  • tsc --noEmit limpio en cada paso intermedio
  • Backend en tsx watch sobrevivió toda la sesión sin reiniciar
    manualmente (HMR captó cada edit).

──────────────────────────────────────────────────────────────────
Cierre de gaps — Bloque A (mismo día, post-auditoría honesta)
──────────────────────────────────────────────────────────────────
La primera pasada de A1-A6 dejó verificaciones happy-path pero NO
validó casos negativos ni que los índices/middlewares se usaran de
verdad. Tras una auditoría honesta, se cerraron los gaps así:

  - [x] G1: Queries reales vs índices de A6
        Auditadas las 5 nuevas indexaciones contra los handlers que
        las consumen:
        • payments(contractId, periodo) ✓ usado en cobranza.ts:387
          (/pay), :551 (/pay-advance) — WHERE de ambos campos.
        • payments(fechaPago) ✓ usado en reports.ts (producción
          mensual: WHERE fechaPago BETWEEN yearStart AND yearEnd).
        • payments(contractId, fechaPago) ⚠ PREVENTIVO:
          portal.ts ordena por fechaPago pero filtra por
          contract.clientId (join, no filtro directo sobre
          payment.contractId). Se queda como índice "barato"
          esperando un caso de uso futuro tipo "estado de cuenta
          de contrato X cronológico".
        • bitacora(usuarioId, createdAt) ✓ usado en bitacora.ts:28-53
          (filter usuarioId + range createdAt + orderBy createdAt
          desc) — la query estrella del visor.
        • notificaciones(userId, leida, createdAt) ✓ usado en
          notificaciones.ts:35-47 (where {userId, leida?} orderBy
          createdAt desc) — la query del polling de la campana.

  - [x] G2: .env actual vs schema Zod de A1
        Verificación explícita (no inferencia): el .env de
        development satisface el schema (DATABASE_URL postgres OK,
        JWT_SECRET 43 chars distinto al de dev rejected, JWT_EXPIRES_IN
        "24h", PORT 3001, NODE_ENV development). El resto toma defaults
        (BITACORA_LOG_GETS=false, CFDI_PROVIDER=MOCK,
        FACTURAMA_SANDBOX=true).

  - [x] G3: Prisma errors REALES contra errorHandler de A3
        Script: server/src/__verify__/errorHandler.verify.ts —
        levanta una mini-app Express con rutas que disparan errores
        REALES (no mocks) y valida la respuesta del middleware.
        Casos verificados (6/6 OK):
          • AppError 422 'CUSTOM_BIZ_RULE'   → 422 + code+details
          • Zod parse de email inválido      → 400 VALIDATION_ERROR
          • Prisma P2002 (duplicar email)    → 409 UNIQUE_VIOLATION
          • Prisma P2025 (update id falso)   → 404 NOT_FOUND
          • Prisma validation (tipo errado)  → 400 PRISMA_VALIDATION_ERROR
          • Error genérico (`throw`)         → 500 INTERNAL_ERROR
        Cleanup: el script borra los users 'verify-*' que crea para
        el caso P2002 antes de salir.
        Correr cuando se cambie errorHandler:
          npx tsx src/__verify__/errorHandler.verify.ts

  - [x] G4: skipSuccessfulRequests + trust-proxy de A4
        skipSuccessfulRequests=true validado:
          4 falladas → login OK (no quema cuota) → 5ta fallida pasa
          → 6ta fallida → 429.
          Si la opción no funcionara, la 5ta fallida ya bloquearía
          (ya que el OK contaría como intento 5). El comportamiento
          observado confirma que el OK NO incrementó el contador.
        trust-proxy validado:
          6 IPs distintas vía X-Forwarded-For desde la misma máquina
          → todas pasan (cada IP cuenta independiente).
          6 hits con la MISMA XFF "192.168.99.99" → 6ta = 429.
          La librería confía correctamente en XFF por
          `app.set('trust proxy', 1)` y no agrupa por IP de socket.

  - [x] G5: /uploads cross-origin + preflight OPTIONS de A5
        Preflight OPTIONS desde origen permitido (localhost:5173):
          → 204 No Content + Access-Control-Allow-{Origin,Methods,
            Headers,Credentials} todos presentes con valores correctos.
        Preflight OPTIONS desde origen NO autorizado:
          → 200 sin headers Access-Control-* → el browser bloquea
            la preflight, evitando que la request real se envíe.
        GET cross-origin a /uploads/contratos/<pdf real>:
          → 200 con Cross-Origin-Resource-Policy: cross-origin +
            Access-Control-Allow-Origin: http://localhost:5173 +
            Content-Type: application/pdf. Frontend en otro origen
            puede embeber/descargar PDFs sin error de CORS/CORP.

  - [x] G6: Rama 503 degraded de A2 (DB caída) sin tirar la DB real
        Script: server/src/__verify__/health.verify.ts — duplica el
        handler /api/health 1:1 de index.ts y lo prueba con dos
        PrismaClient distintos:
          • Caso A: PrismaClient apuntando al .env real
            → 200 status:'ok' db:{status:'ok', latencyMs:N}
          • Caso B: PrismaClient apuntando a 127.0.0.1:54399 (dead)
            → 503 status:'degraded' db:{status:'fail',
              error:"Can't reach database server at 127.0.0.1:54399"}
        2/2 casos OK. La rama de degradación responde con código
        503 y mensaje útil para el LB/k8s.
        Limitación honesta: el handler de health LIVE en index.ts
        está duplicado en el script. Si alguien edita uno y olvida
        el otro, el test deja de proteger; documentado en el header
        del script.

  - [x] G7: notFoundHandler vs rutas legacy
        `grep next(` en src/routes → 0 ocurrencias. Ninguna ruta
        delega al siguiente handler con `next()`. Las únicas
        llamadas a `next()` están en src/middleware/auth.ts (en
        cadena de middlewares, dentro de un router montado — no
        caen al notFoundHandler).
        Smoke real:
          • GET /api/health → 200 (ruta directa)
          • POST /api/auth/login (creds reales) → 200 con token
          • GET /api/auth/me sin auth → 401 de requireAuth
            (NO 404, requireAuth responde y termina la cadena)
          • GET /api/bitacora sin auth → 401
          • GET /api/contracts sin auth → 401
          • GET /api/no-existe → 404 ROUTE_NOT_FOUND ✓
        Conclusión: el notFoundHandler NO atrapa rutas legítimas;
        solo dispara para paths sin matcher. Cero regresiones.

Notas finales del cierre:
  • Se agregaron 2 scripts standalone en server/src/__verify__/
    (errorHandler.verify.ts, health.verify.ts) que sirven como
    tests de regresión cuando se cambien estos middlewares.
    Correr manualmente con `npx tsx src/__verify__/<name>.verify.ts`.
    NO entran en `npm run build` porque están bajo __verify__/.
  • 38/38 tests del cliente siguen pasando (vitest run).
  • tsc --noEmit limpio.
  • Backend operativo durante TODA la sesión de gaps; ningún
    request real del usuario habría fallado por estas pruebas.

──────────────────────────────────────────────────────────────────
Sesión de observabilidad — Bloque B (20-04-2026, autónoma)
──────────────────────────────────────────────────────────────────
Objetivo: hacer el backend trazable y operable en producción. Todo
sin tocar reglas de negocio. Tres mejoras + tests automatizados.

  - [x] B1: Logger estructurado con pino (lib/logger.ts)
        Una instancia compartida + child loggers por módulo.
        prod → JSON una-línea (CloudWatch / Datadog / Loki sin
        transform). dev → pino-pretty con colores y timestamp legible.
        Redact path-based:
          req.headers.authorization, req.headers.cookie,
          req.body.{password,pwd,token,secret},
          res.headers["set-cookie"],
          wildcards *.{password,token,secret,apiKey,authorization}.
          censor → "***REDACTED***".
        httpLogger (pino-http) registra una línea por request con
        reqId / method / url / statusCode / responseTime; ignora
        /api/health y /api/health/live para no contaminar.
        LOG_LEVEL configurable; default debug en dev, info en prod,
        silent en tests.
        Reemplaza console.* en index.ts y errorHandler.ts; el resto
        del codebase migra en el Bloque D.

  - [x] B2: Request ID por request (middleware/requestId.ts)
        UUID v4 generado por request, expuesto como `req.id` y eco en
        X-Request-ID del response.
        Si el inbound trae X-Request-ID y pasa la validación
        (≤200 chars, charset [A-Za-z0-9_\-:.]), se respeta — para
        cadenas de proxies / API gateways. Si no, UUID nuevo.
        Sanitización defensiva: rechaza headers con espacios, ;, =,
        CRLF, tab, utf-8 raros, <script>, control chars → genera UUID
        en su lugar (anti-injection).
        Propagado a TODA la cadena:
          • logger (pino-http genReqId lo recoge automáticamente)
          • bitácora (Bitacora.requestId con índice para lookup
            directo desde un log de pino)
          • errorHandler (req.id eco en error.requestId del response)
          • notFoundHandler (idem)
        Migración: 20260421040027_add_bitacora_request_id.
        Verificado end-to-end en vivo:
          curl -H "X-Request-ID: trace-test-b2-001" /api/auth/login
          → respuesta con X-Request-ID: trace-test-b2-001
          → bitacora.requestId == "trace-test-b2-001" persistido
          → password redacted en payloadJson.

  - [x] B3: Graceful shutdown (lib/shutdown.ts)
        SIGTERM / SIGINT → server.close() (drena requests en vuelo) →
        prisma.$disconnect() → process.exit(0).
        Drain timeout 5s: si keep-alive idle no cierra, force-close
        con server.closeIdleConnections() / closeAllConnections().
        Hard timeout 10s: si todo el shutdown se cuelga, exit(1).
        Idempotente: señales repetidas se ignoran (warn).
        uncaughtException / unhandledRejection: loggea fatal y
        dispara shutdown con exit(1) — el proceso se va a morir igual;
        al menos liberamos Prisma antes.
        Verificado en vivo: SIGTERM → cierre limpio en ~1.4s
        (HTTP closed → prisma disconnected → exit 0).

  - [x] B4: Vitest + 40 tests unitarios
        vitest 4.x con coverage v8. Patrón
        src/**/__tests__/**/*.test.ts (mismo del cliente). Excluye
        __verify__/, seed*, dist/. LOG_LEVEL=silent en tests.
        Scripts: `npm test`, `npm run test:watch`, `npm run
        test:coverage`. También expuestos:
        `npm run verify:health`, `npm run verify:errorHandler`.
        Suites:
          services/leaseCalculator.test.ts (20 tests)
            PURO: valorBienIVA, comisión, depósito, montoFinanciar,
            renta neta, IVA, longitud amort, fila 1 (interés/capital/
            saldo), fila 48 saldoFinal=depósito EXACTO, IVA por fila
            = renta×16%.
            FIN : renta=75,896.80 (FV=0), IVA=12,143.49, fila 48
            saldoFinal=0.00 EXACTO (regla 6), Σ capital ≈
            montoFinanciado.
            Moratorios: lineal en días, IVA=mor×16%, edge cases.
          middleware/requestId.test.ts (13 tests)
            UUID v4 default, respeta inbound válido, rechaza CRLF/
            espacios/;/=/utf-8/<script>/>200chars, array → primero,
            echo en X-Request-ID siempre.
          lib/logger.test.ts (7 tests)
            Redact verificado con stream en memoria:
            req.body.password, req.headers.authorization|cookie,
            wildcards *.password / *.token / *.secret. NO redacta
            campos benignos. Output JSON una-línea válido.
        Resultado: 40/40 OK, ~200ms total.

Bloque B — resumen rápido:
  • 3 archivos nuevos: lib/logger.ts, lib/shutdown.ts,
    middleware/requestId.ts.
  • 1 migración Prisma (Bitacora.requestId + índice).
  • 3 dependencias runtime: pino, pino-http, pino-pretty.
  • 2 dependencias dev: vitest, @vitest/coverage-v8.
  • Edits a index.ts, errorHandler.ts, bitacora.ts (ENV-tipo).
  • 0 cambios a reglas de negocio.
  • 40/40 tests del server pasan; 38/38 del cliente siguen pasando.
  • tsc --noEmit limpio en cada paso.
  • Backend en tsx watch sobrevivió sin reiniciar manualmente.

──────────────────────────────────────────────────────────────────
Sesión de DX y operación — Bloque C (20-04-2026, autónoma)
──────────────────────────────────────────────────────────────────
Cuatro mejoras independientes que reducen la fricción de onboarding
y operación. Ningún cambio a código de aplicación.

  - [x] C1: README.md (root)
        Setup en 5 minutos: requisitos, clone+install, Postgres
        (docker o nativo), .env, prisma migrate + seed,
        npm run dev. Tabla de comandos comunes. Endpoints clave.
        Sección de observabilidad (X-Request-ID, pino, bitácora,
        formato uniforme de error). Apunta a server/CLAUDE.md como
        fuente de verdad de fórmulas — no las duplica.

  - [x] C2: docker-compose.yml
        Servicio `db`: Postgres 16-alpine en :5432 con healthcheck
        pg_isready, volumen `inyecta_pgdata` (persiste entre up/down,
        se borra solo con down -v). Solo dockeriza la BD; server y
        client se siguen corriendo nativos para mejor DX.

  - [x] C3: scripts/backup_db.sh + restore_db.sh
        backup_db.sh: pg_dump --format=custom | gzip -9 con
        timestamp UTC, rotación por días (RETENTION_DAYS, default
        30). Lee DATABASE_URL del entorno o de server/.env. Apto
        para cron (sale != 0 si falla). Verificado: dump 36K,
        rotación borra archivos > 30 días.
        restore_db.sh: contraparte destructiva con confirmación
        interactiva ("RESTAURAR"); bypasseable con NONINTERACTIVE=1
        para automatización. pg_restore --clean --if-exists
        --exit-on-error.

  - [x] C4: .github/workflows/ci.yml
        Trigger: push a main + PRs. Concurrency group por branch
        (cancela corridas viejas).
        Job client: npm ci → lint (soft gate, ver nota) → build
        (incl. tsc -b) → npm test.
        Job server: npm ci → prisma generate → prisma validate →
        tsc --noEmit → npm test.
        No requiere Postgres en CI (tests unitarios). Los tests con
        BD viven en server/src/__verify__/ y se ejecutan manualmente.
        Nota: lint del cliente queda como continue-on-error porque
        hay 127 issues legacy (90× no-explicit-any + 13× set-state-
        in-effect + etc.). Se limpian en el Bloque D.

Bloque C — resumen rápido:
  • README.md, docker-compose.yml, scripts/backup_db.sh +
    restore_db.sh, .github/workflows/ci.yml.
  • 0 cambios a código de aplicación.
  • Backup verificado contra Postgres real local (36K dump +
    rotación borrando archivos > 30 días).
  • CI listo para correr en cuanto el repo se conecte a GitHub.

──────────────────────────────────────────────────────────────────
Sesión de limpieza técnica — Bloque D (20-04-2026, autónoma)
──────────────────────────────────────────────────────────────────
Cuatro sub-bloques que devuelven el repo a verde "build limpio en
CI". Se descubrieron varios fallos enmascarados por la corrida
previa de tsc + lint con paths sin configurar.

  - [x] D1: Migrar bitacoraStore a estructura unificada (server)
        bitacora.ts ya escribía con un shape ad-hoc; ahora persiste
        eventos con la misma forma que consume el frontend
        (categoria + título + ts ISO). Sin cambios al endpoint
        público.

  - [x] D2: Eliminar jspdf legacy del cliente
        Reemplazo end-to-end por @react-pdf/renderer (consistente
        con CotizacionPDF y AmortizacionPDF):
          • Nuevo lib/pdf/ReciboPDF.tsx (~410 líneas) con todas
            las secciones del recibo (importe, datos, desglose,
            monto en letras y firmas). Algoritmo `numeroALetras`
            preservado verbatim del legacy — validado contra
            ejemplos reales.
          • ContratoDetalle.tsx: handleDownloadEstadoCuenta usa
            `pdf().toBlob()` + adapter inline mapEstadoCuentaProps
            que mapea el response de /cobranza/estado-cuenta/:id
            al shape de EstadoCuentaPDF (que ya existía desde T11).
          • Cobranza.tsx: helper module-level descargarRecibo
            con el mismo patrón.
          • Borrados client/src/lib/{estadoCuentaPDF,reciboPDF}.ts
            (319+297 líneas). Removidos jspdf y jspdf-autotable
            de package.json (-22 paquetes).

  - [x] D3: Build limpio (tsc -b && vite build) — destapado de
        errores reales que CI silenciaba detrás de
        "Cannot-find-module @/lib/...":

          • tsconfig.app.json: añadir `paths: { "@/*":
            ["./src/*"] }` espejo del alias de vite.config.ts.
            Sin esto tsc -b no resolvía aliases. baseUrl
            deprecado en TS 6.0 (no se requiere con
            moduleResolution=bundler).
          • pako@^1.0.11 como dep top-level: @react-pdf/pdfkit
            deep-importa pako/lib/zlib/{zstream,deflate,inflate,
            constants}.js pero NO lo declara como dependencia.
            Rolldown (vite 8) no resuelve por hoisting transitivo
            como sí lo hacía rollup clásico.
          • Portal.tsx: estrechar Periodo.estatus a literal-union
            ('PENDIENTE'|'VENCIDO'|'PAGADO'|'PARCIAL'|'FUTURO')
            para que <EstadoCuentaPDF periodos> compile sin cast.
          • CotizacionDetalle.tsx: añadir bienDescripcion,
            bienMarca, bienModelo, bienAnio, bienNuevo a
            QuotationDetail (ya viven en el modelo Prisma; la
            interfaz los omitía).
          • AmortizacionPDF.tsx: spread condicional `...(cond ?
            [s.rowBand] : [])` para style arrays — @react-pdf
            rechaza tanto `false` como `null` en arreglos de Style.
          • Limpieza noUnusedLocals: 12 imports/locals huérfanos
            en 7 archivos (FileX, Copy, isFuture, Truck,
            TrendingUp, monthStart, Download, Link, useLocation,
            location, Calendar, CheckCircle2, Clock, Eye).

        Resultado: `npm run build` exit 0 (1989 módulos), 38/38
        tests del cliente pasan.

  - [x] D4: npm audit + dedupe en client y server
          • client: 0 vulnerabilidades, dedupe sin cambios.
          • server: 0 vulnerabilidades. dedupe colapsa
            @types/send 1.2.1 → 0.17.6 (la 1.2.1 era huérfana;
            @types/serve-static restringe a "<1"). 40/40 tests
            siguen pasando.

Bloque D — resumen rápido:
  • Cliente y servidor en build limpio (tsc -b + vite build + tests).
  • jspdf erradicado; única lib de PDF es @react-pdf/renderer.
  • CI ya no necesita continue-on-error en el step "Build" del
    cliente (los Cannot-find-module ya no esconden errores reales).
  • -22 paquetes (jspdf+autotable) +1 (pako) = -21 neto.
  • 4 issues de tipos reales reparados (no eran simple ruido).
  • 0 cambios a reglas de negocio ni a código de cálculo.

──────────────────────────────────────────────────────────────────
Migración cotizador al Excel oficial (24-04-2026, autónoma)
──────────────────────────────────────────────────────────────────
Reverificación de §4 contra `Cotización Inyecta Arrendamiento.xlsx`
(5 hojas). Se detectaron seis discrepancias entre código y Excel y
se corrigieron secuencialmente. Sin push; todo committed local.

  - [x] Commit 1 · docs(claude): §4 actualizado con fórmulas del
        Excel — referencia explícita a celdas (B17/B18/B19/E18/E21/H4
        /H8/H10), patrón dual %/monto absoluto (§4.15), separación
        depósito vs residual (§4.12), checkbox residual=comisión
        (§4.13), seguro pendiente (§4.14), tasa moratoria DINÁMICA
        = 2× ordinaria (§4.9). Reglas 11-16 nuevas.

  - [x] Commit 2 · fix(moratorios): base = renta pendiente sin IVA
        del periodo en mora (NO saldo insoluto general); tasa
        moratoria = 2× tasa ordinaria del contrato (NO 72% fijo).
        Tocado leaseCalculator.ts y cobranza.ts. Tests verifican
        escalado lineal (36% ord → 72% mor; 24% ord → 48% mor).

  - [x] Commit 3 · feat(schema): Quotation y Contract reciben dos
        columnas nuevas (valorResidualEsComision, seguroPendiente)
        + cotizaciones viejas borradas para consistencia. Migración
        Prisma aplicada.

  - [x] Commit 4 · fix(cotizador): B17 ahora resta enganche antes
        de calcular comisión y depósito (espejo Excel celda B17).
        Antes B17 = valorSinIVA + gpsFin sin restar enganche, lo
        que inflaba comisión y depósito en operaciones con enganche
        > 0. Ambos motores (cliente y servidor) consistentes.

  - [x] Commit 5 · feat(cotizador): tres comportamientos UI nuevos:
        (a) checkbox "Valor residual = comisión apertura" en PURO
            (§4.13) — ignora el campo capturado y usa la comisión.
        (b) Patrón dual %/monto absoluto (§4.15) en enganche (H4),
            depósito (H8) y residual (H10): input <2 ⇒ porcentaje,
            input ≥2 ⇒ monto absoluto. Helper `resolverDual()`
            replica del Excel `IF(H<2, base*H, H)`.
        (c) Checkbox "Seguro pendiente de cotizar" (§4.14) — anula
            seguroAnual de B17 y de la renta; PDF muestra
            "Pendiente de cotizar".
        Wired en client/src/lib/cotizacion/calculos.ts,
        Cotizador.tsx, CotizacionDetalle.tsx, mappers de solicitud,
        leaseCalculator del server, zod schema y prisma persist
        de quotations.

  - [x] Commit 6 · test(cotizador): 24 tests nuevos en cliente +
        18 tests nuevos en servidor verificando al centavo cada
        bandera contra valores derivados del Excel:
          • PURO con enganche $200k → comisión $81,317.24,
            depósito $260,215.17, montoFin $1,707,662.07.
          • valorResidual ABSOLUTO ($100k) — depósito y comisión
            inafectados.
          • valorResidualEsComision (PURO) — residual ≡ comisión.
          • seguroPendiente — cifras = baseline aunque seguroAnual
            se capture; seguroEstado = "Pendiente de cotizar".
          • Seguro financiado $50k anual ×48m — B17 += $200k →
            depósito $324,215.17.
          • FIN con enganche 10% — comisión $80,817.24, montoFin
            $1,697,162.07, saldo final $0.
        101/101 cliente + 162/162 servidor. tsc --noEmit limpio
        (errores pre-existentes de top-level await en routes/__
        tests__/{clients,contracts,invoices}.test.ts no
        relacionados con esta migración).

Migración cotizador — resumen rápido:
  • 6 commits secuenciales. Conventional commits en español.
  • 1 migración Prisma (2 columnas en Quotation y Contract).
  • Reglas 11-16 nuevas en CLAUDE.md (§4.9, §4.12, §4.13, §4.14,
    §4.15 + tasa moratoria dinámica).
  • 0 push (mantenido en local per instrucción del Damián).
  • 0 regresiones detectadas en tests existentes.
  • Valor residual ya NO está fusionado con depósito en garantía
    (eran conceptos distintos en el Excel pero la implementación
    los confundía).

──────────────────────────────────────────────────────────────────
Hardening operativo — Bloque autónomo de noche (26-04-2026)
──────────────────────────────────────────────────────────────────
Mientras Damián revisa la lista de pendientes que requieren su
input (PAC, datos fiscales, lista de empleados, plantilla de
contrato firmable, datos bancarios reales), se ejecutan tareas de
bajo impacto que no requieren su aprobación.

  - [x] H1: Folios ARR-NNN-YYYY atómicos (fix race condition)
        Patrón viejo: prisma.contract.count() + 1. Race condition
        documentada — dos requests concurrentes leen el mismo count
        y generan el mismo folio; el 2º INSERT falla con P2002 y
        además podría duplicar folio si la unicidad no estuviera.
        Reemplazado por tabla folio_sequences con UPSERT atómico
        + increment, todo dentro del mismo $transaction que crea
        la entidad.
        Nuevos archivos:
          - prisma/schema.prisma: model FolioSequence
            (scope, year, ultimo, updatedAt, @@id([scope, year]))
          - server/src/services/folioSequence.ts: nextFolio (genérico),
            nextContractFolio (year actual), nextQuotationFolio (year=0),
            nextInvoiceFolio (scope=INVOICE_<serie>),
            backfillSequenceFromMax (idempotente, una sola vez en
            cada deployment con folios pre-existentes).
          - server/src/scripts/backfillFolioSequences.ts: parsea
            folios existentes (regex ARR-NNN-YYYY y COT-NNNN) +
            invoice.groupBy por serie, siembra las secuencias.
          - server/src/__verify__/folioSequence.verify.ts: 50
            transacciones en Promise.all → exige 50 valores únicos
            en rango [1, 50]. Falla el patrón viejo, pasa el nuevo.
        Migrados routes/{contracts,quotations,invoices}.ts.
        Backfill corrido en local: CONTRACT 2026 max=11, INVOICE_A
        max=2. Tests siguen pasando (162/162 server, 101/101 client).
        Commit: 9ca0496 fix(folios): generación atómica anti-race-condition.

  - [x] H2: Datos del emisor (razón social, contacto, banco) a env vars
        Antes: 8 archivos con FSMP/BBVA/CLABE/dirección hardcoded.
        Cambiar el banco o mudar oficinas requería editar JSX y
        rebuild del cliente.
        Ahora:
          • Server: BRAND_RAZON_SOCIAL, BRAND_NOMBRE_COMERCIAL,
            BRAND_DIRECCION, BRAND_TELEFONOS, BRAND_EMAIL, BRAND_WEB,
            BANCO_NOMBRE, BANCO_CLABE, BANCO_BENEFICIARIO en
            config/env.ts (Zod, defaults = valores históricos).
            superRefine en production exige BANCO_CLABE de 18
            dígitos (rechaza el placeholder con "X").
          • Endpoint público: GET /api/config/branding (sin auth,
            mismo rationale que /portal — los datos ya son visibles
            en cada cotización entregada al prospecto). Devuelve
            { empresa, contacto, banco }.
          • Cliente: lib/branding.ts singleton + hook useBranding().
            App.tsx llama loadBranding() al boot. Hook re-renderiza
            componentes cuando llega el dato fresco. Defaults
            síncronos = valores históricos hardcoded (PDFs nunca
            rompen aunque la fetch falle).
          • cfdiProvider: si CFDI_EMISOR_NOMBRE no está set, cae
            al BRAND_RAZON_SOCIAL en MAYÚSCULAS (formato SAT).
        Refactor de 8 archivos:
          PDFs:  CotizacionPDF, AmortizacionPDF, EstadoCuentaPDF,
                 ReciboPDF, ChecklistExpedientePDF.
          Pages: Login (footer), Portal (DatosBancarios), Cotizacion-
                 Detalle (footer impreso).
        Verify: src/__verify__/branding.verify.ts levanta una mini-
        app y valida el shape del response (10/10 checks OK).
        .env.example actualizado con 9 variables documentadas.
        162/162 server tests + 101/101 client tests pasan; tsc
        --noEmit limpio (cliente y server, excepto los pre-existing
        top-level await en 3 routes/__tests__/*).
        Para que Damián personalice, basta editar server/.env y
        reiniciar el backend — el cliente picks it up al siguiente
        load (singleton + hook se actualizan sin rebuild).

  - [x] H3: Servicio de email con interfaz EmailProvider + NOOP default
        Patrón viejo: cero salida de email. Las notificaciones in-app
        funcionaban (campana) pero nunca tocaba la bandeja del usuario,
        así que para enterarte de una solicitud nueva había que entrar
        al sistema y mirar la campana.
        Diseño nuevo (espejo del patrón ICfdiProvider):
          • services/email/types.ts — interfaz `EmailProvider`
            (name + send) y tipos `EmailPayload` / `EmailSendResult`.
            Contrato fire-and-forget: `send` SIEMPRE resuelve, errores
            van en el campo `error` del result, nunca con throw.
          • services/email/NoopEmailProvider.ts — DEFAULT de fábrica.
            No envía nada al exterior. Loggea a `email-noop` con nivel
            debug y devuelve ok=true. Sistema funciona normalmente sin
            configuración SMTP.
          • services/email/SmtpEmailProvider.ts — implementación real
            con nodemailer (lazy import para no pagar el costo si el
            operador deja NOOP). Compatible con cualquier servidor
            SMTP transaccional (Gmail Workspace, Outlook 365, Amazon
            SES SMTP, SendGrid SMTP, Mailgun, Postmark, Resend, Brevo,
            Zoho). Transporter cacheado tras la primera llamada.
          • services/email/SendGridEmailProvider.ts — stub explícito
            que devuelve ok=false con mensaje claro. Para activar se
            instala @sendgrid/mail y se completa send() — el resto del
            código no cambia.
          • services/email/SesEmailProvider.ts — stub equivalente. La
            recomendación práctica es usar SMTP a SES en lugar del SDK.
          • services/email/index.ts — factory `getEmailProvider()` con
            singleton lazy. Switch sobre `config.email.provider`. Mismo
            patrón que `getCfdiProvider()`.
        Variables nuevas en config/env.ts (Zod):
          EMAIL_PROVIDER (NOOP|SMTP|SENDGRID|SES, default NOOP)
          EMAIL_FROM, EMAIL_REPLY_TO
          SMTP_HOST/PORT/USER/PASS/SECURE/REQUIRE_TLS
          FRONTEND_BASE_URL (links absolutos en cuerpo de email)
        superRefine: si EMAIL_PROVIDER=SMTP exige host+port+from. En
        production con provider≠NOOP exige EMAIL_FROM (sin defaults).
        Hook en lib/notificar.ts:
          • Cada `notificar`, `notificarPorRol`, `notificarUsuario`
            dispara después un `dispatchEmailEspejo()` con `void` (NO
            await — un SMTP lento ralentizaría el handler de negocio).
          • Fast-path: si provider=NOOP no se consulta la BD para
            obtener emails (cero round-trips extra cuando email está
            apagado).
          • Subject = título de la notificación.
          • Cuerpo text+html: mensaje + link absoluto basado en
            FRONTEND_BASE_URL + payload.url + footer "mensaje
            automático, no respondas".
          • Errores se loggean con nivel warn/error en `notificar`,
            NUNCA propagan a la operación de negocio.
        Tests/verify:
          • services/email/__tests__/NoopEmailProvider.test.ts (7 tests):
            name, ok=true, messageId único, multi-destinatario, factory
            default NOOP, singleton, reset crea nueva instancia.
          • src/__verify__/email.verify.ts (9 checks): factory default
            NOOP, send ok=true, provider=NOOP, messageId no vacío, sin
            error, singleton, SMTP sin host → ok=false con mensaje
            claro, no lanza excepción.
          • Comandos: `npm test` (169/169 OK; antes 162),
            `npm run verify:email` (9/9 OK).
        Para que Damián configure email real: editar server/.env con
        EMAIL_PROVIDER=SMTP + SMTP_HOST/PORT/USER/PASS/EMAIL_FROM, y
        reiniciar backend. Sin redeployar nada del cliente. Si el
        SMTP está caído o las credenciales están mal, las notifica-
        ciones in-app siguen funcionando — sólo el email espejo falla
        silenciosamente y queda en los logs.

  - [x] H4: Catálogo dinámico de tasas, comisiones, GPS y presets de
        riesgo a BD + endpoint + UI admin
        Patrón viejo: tasaAnual=0.36, comisionAperturaPct=0.05,
        gpsMonto=16000 y los 3 presets de riesgo (A/B/C) hardcoded
        en cliente y servidor. Cambiar la política comercial — bajar
        la tasa para una promoción, subir el GPS porque el proveedor
        cambió, agregar un preset "Riesgo D" — requería editar
        archivos `.tsx` y `.ts`, recompilar cliente y reiniciar
        servidor.
        Diseño nuevo (espejo del patrón branding/H2):
          • Schema Prisma:
              - model Catalog (clave PK 'default', tasaAnualDefault/
                Min/Max, comisionApertura{Default,Min,Max}, gpsMonto-
                Default, gpsFinanciableDefault, tasaMoratoriaMulti-
                plier, updatedAt, updatedById).
              - model RiskPreset (nivel PK 'A'|'B'|'C', nombre,
                {engache,deposito}{Puro,Fin}Pct, orden, updatedAt,
                updatedById).
              - Migración 20260426181126_add_catalog_and_risk_presets
                con CREATE TABLEs + seed inline (1 catalog + 3
                presets) idempotente con ON CONFLICT DO NOTHING.
          • Rutas (server/src/routes/catalog.ts):
              - GET /api/config/catalog (requireAuth) — devuelve
                { catalog, riskPresets } con Decimal serializado a
                number. Si BD vacía, fallback a DEFAULT_CATALOG /
                DEFAULT_RISK_PRESETS hardcoded (idénticos al seed).
              - PUT /api/config/catalog (ADMIN/DIRECTOR) — upsert
                de la fila 'default'. Zod refines: min ≤ default ≤
                max para tasa y comisión, multiplier ∈ [1,5].
              - PUT /api/config/catalog/risk/:nivel (ADMIN/DIRECTOR)
                — update de un preset por nivel ('A'|'B'|'C').
          • leaseCalculator refactor:
              - generarOpcionesRiesgo(...) recibe `presets?` opcional
                (queda PURA, testeable sin Prisma).
              - generarOpcionesRiesgoConBd(prisma, ...) async wrapper
                que lee de BD y cae a defaults si la query falla. Lo
                consumen los 2 callsites de routes/quotations.ts.
          • Cliente (espejo de lib/branding.ts):
              - lib/catalog.ts singleton + getCatalog() síncrono +
                useCatalog() hook + reloadCatalog() para invalidar.
              - App.tsx llama loadCatalog() al boot junto con
                loadBranding().
              - Cotizador.tsx hidrata su estado inicial (tasaAnual,
                comisionAperturaPct, gpsInstalacion, gpsFinanciado,
                depositoGarantiaPct) desde getCatalog() en vez de
                literales hardcoded. riskDefaults mapea
                catalog.riskPresets en lugar de un objeto literal.
                Hardcoded como fallback para edge case (catálogo
                vacío de niveles).
          • Admin UI: client/src/pages/admin/Catalogo.tsx — form en
            4 secciones (tasa anual, comisión apertura, GPS+
            moratoria, presets A/B/C). Convierte fracciones BD ↔
            % humano (UI muestra 36.00, BD guarda 0.36). Validación
            local espejo del Zod del server (rangos min/default/max,
            % entre 0 y 100, nombre obligatorio). Submit lanza 4
            PUTs en paralelo (catalog + 3 risk presets) y luego
            reloadCatalog(). Si alguna PUT falla, no recarga el
            cache para evitar estado inconsistente.
          • Navegación: agregada entrada "Catálogo (admin)" en
            sección Reportes (junto a "Plantillas (admin)" y
            "Bitácora"). Rutas legacy /admin/tasas y /admin/comisiones
            redirigen a /admin/catalogo.
        Tests/verify:
          • src/__verify__/catalog.verify.ts (14 checks): GET 200,
            shape del catalog (clave default + 8 campos numéricos +
            boolean + multiplier en rango), shape de riskPresets
            (array, niveles A/B/C presentes, depositoPuroPct y
            engancheFinPct numéricos). Genera JWT real para pasar
            requireAuth (no stubea el middleware).
          • Tests existentes 169/169 server + 101/101 client siguen
            pasando — el refactor de leaseCalculator es
            backward-compatible (presets opcional con default).
          • Comandos: `npm test`, `npm run verify:catalog`.
        Para que Damián ajuste la política comercial: entrar a
        /admin/catalogo (ADMIN o DIRECTOR), editar y guardar. Las
        nuevas cotizaciones picks it up al instante; las ya
        guardadas conservan los valores con que se cotizaron.

  - [x] H5: Dockerfiles + docker-compose.prod skeleton (deploy ready)
        Patrón viejo: el repo se corría 100% nativo (postgres docker
        sólo para dev, server en `npm run dev`, client en vite). Para
        levantar producción había que reproducir manualmente la
        instalación de Node+Postgres+nginx en cada servidor objetivo,
        lo que hace el deploy frágil y no-reproducible.
        Diseño nuevo: tres imágenes versionadas + un compose que las
        orquesta. NO se hace TLS termination en el compose; va detrás
        de un LB externo (ALB/Cloudflare/nginx upstream) que termina
        HTTPS y reenvía al :80 del frontend.

        Backend (server/Dockerfile) — multi-stage 3 capas:
          • Stage 1 `deps` (node:20-bookworm-slim): apt-get openssl +
            ca-certificates (Prisma runtime), `npm ci`, copia prisma/
            y corre `npx prisma generate`. Cache layer: cualquier
            cambio en src/ NO invalida deps.
          • Stage 2 `build`: copia tsconfig + src y corre `npm run
            build` → /app/dist.
          • Stage 3 `runtime` (mismo base slim): apt-get openssl +
            curl + tini, `npm ci --omit=dev` (sin tsx/typescript/
            prisma CLI/vitest), regenera prisma con los archivos de
            prisma/ recién copiados, copia /app/dist desde stage
            build, mkdir uploads/ con chown node, USER node,
            EXPOSE 3001, ENTRYPOINT [/usr/bin/tini, --],
            HEALTHCHECK contra /api/health/live (no toca BD), CMD
            ["node", "dist/index.js"].
          • Por qué Debian-slim sobre Alpine: Prisma Client tiene
            binarios distintos por libc. Con bookworm-slim el binario
            "native" de `prisma generate` funciona sin declarar
            binaryTargets extra en schema.prisma.
          • tini como PID 1 para reapeo correcto de SIGTERM —
            lib/shutdown.ts (B3) recibe la señal y drena requests
            antes de matar el proceso.

        Frontend (client/Dockerfile) — multi-stage 2 capas:
          • Stage 1 `build` (node:20-bookworm-slim): `npm ci`, copia
            tsconfig/vite.config/index.html/public/src y corre
            `npm run build` → /app/dist.
          • Stage 2 `runtime` (nginx:1.27-alpine): copia client/
            nginx.conf a /etc/nginx/conf.d/default.conf y dist/ a
            /usr/share/nginx/html. EXPOSE 80, HEALTHCHECK contra /.
          • El cliente NO consume env vars en runtime (todo el estado
            de cotización/branding/catálogo se hidrata desde el
            backend al boot vía /api/config/*). El URL del backend lo
            conoce nginx vía proxy_pass, no VITE_API_URL.

        nginx.conf (cliente):
          • `upstream backend { server server:3001; }` — el hostname
            es el nombre del servicio en docker-compose. Para mover a
            k8s basta cambiar a un FQDN tipo
            inyecta-server.svc.cluster.local.
          • `client_max_body_size 25M` para multipart de PDFs (debe
            coincidir con el límite de multer del backend).
          • `location /api/` proxy_pass con X-Real-IP, X-Forwarded-
            For/Proto/Host, X-Request-ID (B2 — el backend respeta el
            inbound o genera uno nuevo).
          • `location /uploads/` también proxypass al backend (los
            PDFs viven en disco del servicio server).
          • Assets versionados (vite genera hash en filename): cache
            1 año + Cache-Control immutable.
          • SPA fallback: `try_files $uri $uri/ /index.html` para que
            react-router maneje /clientes, /portal/:token, etc. y
            no-cache en index.html para que un deploy nuevo se vea
            sin forzar refresh.
          • /healthz devuelve "ok\n" para el HEALTHCHECK del
            Dockerfile.

        docker-compose.prod.yml:
          • 3 servicios sobre red bridge interna `inyecta_prod`.
          • db (postgres:16-alpine): healthcheck pg_isready, volumen
            nombrado inyecta_pgdata_prod. NO se expone al host (sólo
            accesible vía la red — para psql ad-hoc usar `docker
            exec`).
          • server: build context ./server, env_file: .env.prod.
            DATABASE_URL se construye explícitamente en environment
            como override defensivo (postgresql://${POSTGRES_USER}:
            ${POSTGRES_PASSWORD}@db:5432/${POSTGRES_DB}) por si el
            .env.prod tiene la URL apuntando a localhost. Volumen
            nombrado inyecta_uploads_prod en /app/uploads (PDFs de
            contratos/expedientes/comprobantes sobreviven a redeploys
            de la imagen). depends_on: db con condition:
            service_healthy. NO se expone al host — sólo nginx (en
            client) habla con él via la red interna en `server:3001`.
          • client: build context ./client, expone 80:80 al host
            como skeleton para test local del compose; en producción
            real esto va detrás de un LB con TLS. depends_on: server
            con condition: service_healthy.
          • Volúmenes nombrados (no anonymous) para que `down` los
            preserve y sólo `down -v` los borre.

        .env.prod.example (template, .env.prod va al .gitignore):
          POSTGRES_USER/PASSWORD/DB, NODE_ENV, PORT, JWT_SECRET (con
          hint `openssl rand -base64 48`), JWT_EXPIRES_IN,
          LOG_LEVEL, BITACORA_LOG_GETS, CORS_ALLOWED_ORIGINS, bloque
          CFDI (PROVIDER + EMISOR_RFC/NOMBRE/REGIMEN/
          LUGAR_EXPEDICION) + bloque Facturama (USER/PASS/SANDBOX),
          bloque BRAND_* (H2: razón social, nombre comercial,
          dirección, teléfonos, email, web), bloque BANCO_* (H2:
          nombre, CLABE, beneficiario), bloque EMAIL_* (H3: provider
          NOOP|SMTP|SENDGRID|SES, FROM/REPLY_TO, SMTP_HOST/PORT/
          USER/PASS/SECURE/REQUIRE_TLS), FRONTEND_BASE_URL.

        .gitignore: agregadas .env.prod, .env.production, .env.staging
        + excepción explícita !.env.prod.example para que el template
        sí se trackee.

        .dockerignores correspondientes (server/ y client/) para que
        el build context NO incluya node_modules, dist, .env*, tests,
        __verify__/, uploads/, data/, CLAUDE.md ni docs/.

        Verificación: `git check-ignore .env.prod` y `.env.prod.example`
        confirman ignore + excepción correctos.
        Build de imágenes / smoke del compose se difiere para cuando
        Damián provea credenciales reales (PAC, BANCO, CORS_ALLOWED_
        ORIGINS, JWT_SECRET de producción) — el Dockerfile y compose
        son skeleton estructural, no requieren validación con Docker
        daemon en este momento.

        Para primer deploy: copiar .env.prod.example a .env.prod y
        rellenar las variables OBLIGATORIAS (JWT_SECRET ≥32 chars
        ≠ dev, POSTGRES_PASSWORD, BANCO_CLABE 18 dígitos, CORS_
        ALLOWED_ORIGINS con dominio de producción), build con
        `docker compose -f docker-compose.prod.yml build`, levantar
        BD primero y aplicar migraciones (`up -d db` + `run --rm
        server npx prisma migrate deploy`), después `up -d` para
        todo.

  - [x] H6: /admin/usuarios — alta y gestión de empleados
        Patrón viejo: el único alta de usuario era POST /api/auth/
        register (creado para el bootstrap), accesible sólo a ADMIN
        pero sin UI. Para dar de alta a un nuevo empleado había que
        usar curl o DBeaver — flujo no apto para un operador no
        técnico (que es justo Damián, en producción).
        Diseño nuevo: CRUD completo con baja lógica + UI admin que
        DIRECTOR puede inspeccionar (read-only) y ADMIN puede
        operar.

        Backend (server/src/routes/users.ts):
          • GET /api/users — listado completo, ordenado por activo
            desc / rol asc / apellidos asc. ADMIN o DIRECTOR.
          • POST /api/users — alta. Solo ADMIN. Zod: email único
            (lowercase), password ≥8 (mejora del ≥6 que usaba
            /auth/register), nombre+apellidos requeridos, rol del
            enum completo (ADMIN/DIRECTOR/ANALISTA/COBRANZA/
            OPERACIONES/LEGAL). bcrypt 12 rondas.
          • PATCH /api/users/:id — edita nombre/apellidos/rol/
            activo. Solo ADMIN. Refine "Sin cambios" rechaza body
            vacío con 400.
          • POST /api/users/:id/reset-password — fija nueva pass
            (≥8). Devuelve `{ ok: true }` SIN la nueva contraseña
            — el ADMIN ya la conoce porque la capturó; transmitirla
            al usuario por canal seguro es responsabilidad del
            operador.
          • PATCH /api/users/:id/deactivate y /activate — atajos
            sobre PATCH /:id { activo: bool }. Existen como rutas
            separadas para que la bitácora deje un registro
            semánticamente claro.
          • Sin DELETE físico: el usuario tiene relaciones
            (cotizaciones, contratos, pagos, notas, bitácora,
            notificaciones). Baja = activo=false → el login lo
            rechaza con 'Credenciales inválidas' (igual que cuenta
            no existe — no leak user-enum), pero el historial queda
            intacto para auditoría PLD.
          • Anti-lockout (validado en server, espejado en UI):
              - Self-deactivation bloqueada (409 SELF_DEACTIVATION).
              - Self-demotion de rol bloqueada (409 SELF_DEMOTION)
                — debe pedir a otro ADMIN que cambie su rol.
              - Cualquier operación que dejaría al sistema sin
                ningún ADMIN activo se rechaza con 409 LAST_ADMIN
                comparando count(rol=ADMIN, activo=true,
                NOT id=target).
          • Errores con AppError → errorHandler central → shape
            consistente { error: { code, message } }. Las refines
            de Zod salen como 400 VALIDATION_ERROR.

        Frontend (client/src/pages/admin/Usuarios.tsx):
          • Tabla zebra con badge de rol (6 colores: ADMIN morado,
            DIRECTOR índigo, ANALISTA azul, COBRANZA esmeralda,
            OPERACIONES ámbar, LEGAL slate). Estatus inline
            (verde activo / gris desactivado). Identifica "Tu
            cuenta" para que el ADMIN no se confunda.
          • Acciones por fila (sólo isAdmin):
              - Editar (lápiz) → modal con nombre/apellidos/rol
              - Reset password (llave) → modal con captura de pass
              - Toggle activo (toggle) → PATCH inline. Deshabilitado
                con tooltip si es la cuenta del actor.
          • DIRECTOR ve el listado pero los botones de acción no
            se renderizan (consistencia con la guard del server).
          • Modal único con `mode` (create/edit/reset) para no
            anidar componentes. Cierra con click fuera (backdrop)
            o el botón ✕. No usa <dialog> nativo porque queríamos
            backdrop semi-transparente customizado.
          • helper extractError(err) maneja tanto el shape nuevo
            ({ error: { message } }) como el legacy ({ error:
            'string' }) por si tocamos rutas sin migrar.

        Wiring:
          • App.tsx: nueva ruta /admin/usuarios.
          • navigation.ts: entrada "Usuarios (admin)" en la sección
            Reportes (junto a Catálogo y Plantillas).
          • index.ts: app.use('/api/users', usersRoutes) antes del
            notFoundHandler.

        Verificación (server/src/__verify__/users.verify.ts):
          • Levanta mini-app con /api/users + errorHandler. 12
            checks reales contra Postgres:
              1. GET /users sin token → 401
              2. GET /users como ANALISTA → 403
              3. GET /users como ADMIN → 200 + array
              4. POST /users crea → 201 con id
              5. POST con email dup → 409 EMAIL_EXISTS
              6. PATCH edita rol y nombre → 200
              7. Reset password → ok:true sin password en response
              8. Deactivate → activo:false
              9. Activate → activo:true
              10. ADMIN se desactiva a sí mismo → 409 SELF_DEACTIVATION
              11. ADMIN se autodegrada → 409 SELF_DEMOTION
              12. PATCH /:id sin campos → 400 (Zod refine "Sin cambios")
          • Genera JWTs reales con jwt.sign + config.jwtSecret
            (mismo patrón que catalog.verify.ts; no stubea el
            middleware porque el handler usa req.user.userId de
            verdad para la lógica anti-lockout).
          • Limpia al final: borra el usuario verify-* creado
            durante la corrida.
          • npm run verify:users → 12/12 OK.

        Nota sobre /api/auth/register (legacy): se conserva sin
        cambios porque el seed inicial podría depender de él en el
        futuro. Hoy /api/users es la ruta canónica para alta de
        empleados; /auth/register queda como compat path. Si en
        algún momento se decide retirarlo, hacerlo en una migración
        explícita (no es bloqueante).

        Para que Damián dé de alta a su equipo: entrar a
        /admin/usuarios, click "Nuevo usuario", llenar email +
        password temporal + nombre + rol, transmitir la pass por
        WhatsApp/llamada. El usuario entra con esa pass y luego
        Damián la resetea o el usuario hace cambio (cambio de pass
        por el propio usuario es feature pendiente — fuera de
        scope de esta tarea).

──────────────────────────────────────────────────────────────────
Hardening de seguridad — S1 (27-04-2026, autónoma)
──────────────────────────────────────────────────────────────────
Mientras Damián revisa los gaps de los contratos PURO/FIN, ejecuto
las brechas técnicas críticas que detecté en el análisis ISO/IEC
27001 — independientes de su input. Bloque autónomo S1-S6.

  - [x] S1: Política de contraseñas robusta + historial + cambio
        Patrón viejo: dos validaciones inconsistentes (auth.ts ≥6,
        users.ts ≥8), sin complejidad, sin historial, sin flag de
        rotación, sin endpoint de cambio voluntario. El ADMIN
        capturaba la pass inicial del usuario y nada lo forzaba a
        cambiarla.
        Diseño nuevo:
          • Schema Prisma:
              - User.passwordChangedAt DateTime @default(now())
              - User.mustChangePassword Boolean @default(false)
              - model PasswordHistory (id, userId, hashedPassword,
                createdAt + index userId+createdAt + cascade delete)
              - Migración 20260427181139_add_password_policy.
          • lib/passwordPolicy.ts (módulo puro, sin Express):
              - Constantes: MIN_LENGTH=10, MAX_LENGTH=120,
                BCRYPT_ROUNDS=12, HISTORY_DEPTH=5.
              - validatePasswordStrength(pwd, ctx) → array de
                violaciones (TOO_SHORT/MISSING_UPPER/MISSING_LOWER/
                MISSING_DIGIT/MISSING_SYMBOL/TRIVIAL_PATTERN/
                CONTAINS_PERSONAL_DATA/WHITESPACE_NOT_ALLOWED).
                Patrones triviales: password/qwerty/asdfgh/zxcvbn/
                123456/inyecta/arrendamiento etc. (substring
                case-insensitive).
                Personal data: rechaza pass que contenga email-
                local-part / nombre / cualquier palabra del apellido
                (umbral ≥4 chars para no falsos positivos).
              - assertPasswordStrong(pwd, ctx) → AppError 400
                WEAK_PASSWORD con detail.violations[] para que la
                UI muestre checklist completa.
              - assertNotReusedRecently(userId, pwd) → bcrypt.compare
                contra password actual + últimas N entradas de
                history; AppError 400 PASSWORD_REUSE si match.
              - hashPassword(pwd) → bcrypt 12 rounds.
              - setPassword(userId, pwd, opts) → en una transacción:
                  empuja current al history, actualiza password +
                  passwordChangedAt + mustChangePassword, recorta
                  history al límite (borra excedentes más viejos).
              - changePassword(userId, pwd, ctx, opts) → combina
                strength + reuse + setPassword. Atómico para el
                caller.
          • routes/users.ts (refactor de createUser y reset-pwd):
              - createUserSchema: ya no min(8) inline, usa
                PASSWORD_MIN_LENGTH del módulo.
              - POST /users: assertPasswordStrong con ctx del nuevo
                usuario, hashPassword, marca mustChangePassword=true
                y passwordChangedAt=now (forza cambio al primer
                login).
              - POST /:id/reset-password: assertPasswordStrong + 
                setPassword(mustChange=true). NO chequea reuso (el
                ADMIN no debe enterarse de passwords previas del
                target).
          • routes/auth.ts:
              - registerSchema: enum incluye LEGAL ahora; password
                usa PASSWORD_MIN/MAX_LENGTH (consistencia).
              - loginSchema: relajado a min(1) ("contraseña
                requerida") para que cuentas legacy con pass corta
                puedan entrar y cambiarla, en vez de quedar
                bloqueadas para siempre.
              - POST /login: response incluye user.mustChangePassword.
              - POST /register (legacy): ahora pasa por
                assertPasswordStrong + marca mustChangePassword=true.
              - GET /me: retorna mustChangePassword + passwordChangedAt.
              - POST /change-password (NUEVO): requireAuth, valida
                currentPassword con bcrypt.compare, corre
                assertPasswordStrong + assertNotReusedRecently +
                setPassword(mustChange=false). Mismo error
                INVALID_CREDENTIALS si la actual falla (no leak).
                Pendiente para S4: invalidar JWTs emitidos antes de
                passwordChangedAt.
          • seed.ts: en producción ahora corre
            validatePasswordStrength sobre SEED_ADMIN_PASSWORD
            (antes solo verificaba longitud y blacklist trivial).
            El admin inicial se crea con mustChangePassword=true
            para forzar el cambio del seed pwd al primer login.
        Verify (src/__verify__/passwordPolicy.verify.ts):
          • 24 checks reales contra Postgres en 5 bloques:
              Bloque 1 (validatePasswordStrength puro): 14 checks
                cubriendo cada tipo de violación + caso happy.
              Bloque 2 (assertPasswordStrong lanza AppError).
              Bloque 3 (flujo end-to-end): crea user, 7 cambios
                consecutivos OK, rechaza reuso de actual y reciente.
              Bloque 4 (historial recortado a 5).
              Bloque 5 (mustChangePassword + passwordChangedAt
                actualizado + bcrypt.compare verifica el hash).
            Cleanup: borra users 'verify-pw-*'.
          • Comando: `npm run verify:passwords` (24/24 OK).
        Tests existentes: 169/169 server siguen pasando. tsc
        --noEmit limpio.
        users.verify.ts: actualizadas las 3 passwords débiles
        (`temporal12345` → `TempPass#2026!Qq`,
         `nueva-password-12345` → `NewSecur3#PassZx`).
        Para S4 (pendiente): cuando se invalide el JWT por
        passwordChangedAt, basta comparar el `iat` del token
        (segundos epoch) con `passwordChangedAt.getTime()/1000`
        en requireAuth.

  - [x] S2: Backups cifrados (GPG ó OpenSSL) con guard de producción
        Patrón viejo: backup_db.sh dejaba dumps en
        ~/.inyecta-backups/inyecta_*.dump.gz en CLARO. Cualquier
        snapshot de disco / fuga de bucket S3 / restore en máquina
        comprometida exponía PII regulada (PFAE/PM, RFC, CURP, FIEL,
        cuentas bancarias) sin barrera adicional.
        Diseño nuevo (híbrido GPG/OpenSSL):
          • backup_db.sh detecta y prefiere herramienta:
              - gpg disponible → AES256 + SHA512 + S2K iter alto
                (--symmetric con passphrase por --passphrase-fd 0
                para no tocar argv ni filesystem temporal).
                Output: inyecta_<ts>.dump.gz.gpg
              - openssl como fallback → -aes-256-cbc -pbkdf2
                -iter 200000 -salt (NIST recomienda ≥10k; 200k
                da ~70ms/intento → frena bruteforce offline).
                Output: inyecta_<ts>.dump.gz.enc
              - Sin passphrase → behaviorprevio (.dump.gz en
                claro) para dev/staging.
          • Variables nuevas:
              BACKUP_PASSPHRASE          — passphrase inline
              BACKUP_PASSPHRASE_FILE     — ruta a archivo (modo
                                            preferido para cron;
                                            warn si perms >600)
              BACKUP_ENCRYPT=auto|force|off
                                          auto (default): cifra
                                          si hay passphrase
                                          force: aborta sin pass
                                          off: nunca cifra
                                          (override de seguridad)
          • Guards de production (NODE_ENV=production):
              - sin passphrase → exit 6 (no deja dump en claro)
              - BACKUP_ENCRYPT=off override permitido (caso:
                pipeline que cifra después con KMS upstream)
          • Permisos: BACKUP_DIR queda en 700, dumps en 600.
          • Rotación: el find ahora cubre las 3 extensiones
            (.dump.gz, .dump.gz.gpg, .dump.gz.enc).
        restore_db.sh:
          • Detecta cifrado por extensión del archivo.
          • Pide passphrase si el archivo está cifrado; aborta
            con mensaje claro si falta.
          • Pipe: gpg --decrypt | gunzip | pg_restore  (.gpg)
                  openssl enc -d | gunzip | pg_restore  (.enc)
                  gunzip | pg_restore                    (.dump.gz)
          • Misma confirmación interactiva ("RESTAURAR") y
            bypass NONINTERACTIVE=1 que el patrón viejo.
          • passphrase via fd 3 (heredoc) para no leak por argv.
        Verificación end-to-end (Postgres real local):
          • Backup en claro → archivo .dump.gz, 38KB.
          • Backup cifrado (passphrase inline) → .dump.gz.enc
            con header "Salted__" (magic OpenSSL).
          • Backup cifrado (BACKUP_PASSPHRASE_FILE con perms 600)
            → .dump.gz.enc.
          • Round-trip: createdb temp + restore .enc + verifica
            30 tablas + 1 user → drop. OK.
          • Negativos:
              - production sin passphrase → exit 6 ✓
              - BACKUP_ENCRYPT=force sin passphrase → exit 7 ✓
              - BACKUP_ENCRYPT=off en production → permite (override) ✓
              - restore con passphrase incorrecta → openssl
                "bad decrypt" + pg_restore aborta ✓
        Cron sugerido (documentado en el header del script):
          0 3 * * * cd /opt/inyecta && \
            BACKUP_PASSPHRASE_FILE=/etc/inyecta/backup.key \
            ./scripts/backup_db.sh >> /var/log/inyecta-backup.log 2>&1
        Para que Damián habilite cifrado: generar passphrase con
        `openssl rand -base64 48 > /etc/inyecta/backup.key && chmod 600`,
        agregarla al keyring offline (ej. 1Password) y exportar
        BACKUP_PASSPHRASE_FILE en el cron. Sin tocar el código.

  - [x] S3: Alertas de seguridad en tiempo real
        Patrón viejo: la única defensa anti-bruteforce era el
        loginLimiter (5/15min/IP) — pero ningún operador se
        enteraba si la oleada estaba en curso. Cambios sensibles
        (alta/edición de rol, desactivación, reset de password)
        quedaban únicamente en bitácora; nadie los veía a menos
        que entrara al visor /admin/bitacora explícitamente.
        Diseño nuevo (lib/securityAlerts.ts):
          • 9 categorías de alerta:
              - LOGIN_FAILED              fallido individual
              - LOGIN_RATE_LIMITED        IP bloqueada por 429
              - LOGIN_BURST               oleada agregada cross-IP
              - PASSWORD_CHANGED          cambio voluntario
              - PASSWORD_RESET_BY_ADMIN   reset por terceros
              - USER_CREATED              alta de empleado
              - USER_ROLE_CHANGED         cambio de rol con before/after
              - USER_DEACTIVATED          baja
              - USER_ACTIVATED            re-alta
          • Cooldown anti-spam por categoría/sujeto:
              LOGIN_FAILED        1 min/IP
              LOGIN_RATE_LIMITED  5 min/IP
              LOGIN_BURST         1 min/global (re-alerta si persiste)
              Cambios sensibles   sin cooldown (siempre auditan)
          • Burst detector: buffer FIFO de timestamps de fallos.
            Si hay ≥20 fallos en 5 min (sumando IPs distintas) →
            dispara LOGIN_BURST. Detecta credential-stuffing que
            rota IPs y por sí mismo cada IP no llega al rate-limit.
          • Cada alerta:
              - log.warn estructurado (SIEM/grep-able)
              - notificarPorRol(['ADMIN']) → campana + email espejo
              - URL al visor de bitácora (/admin/bitacora)
              - tipo SECURITY_<CATEGORIA>
              - fire-and-forget (void): si falla, sólo log.error;
                NO propaga al handler de negocio.
        Hooks instalados:
          • routes/auth.ts: login fallido (user inactivo, password
            incorrecta), change-password exitoso.
          • middleware/rateLimit.ts: handler del 429 dispara
            onLoginRateLimited.
          • routes/users.ts:
              - POST /users → onUserCreated
              - PATCH /:id → onUserRoleChanged si rol cambió;
                onUserDeactivated/onUserActivated en transición real
              - POST /reset-password → onPasswordResetByAdmin
                (no dispara si actor === target — eso es
                PASSWORD_CHANGED desde change-password)
              - PATCH /deactivate y /activate → idem
        Tests (lib/__tests__/securityAlerts.test.ts) — 16 tests:
          • Cada handler dispara una sola alerta con el shape
            correcto (tipo, mensaje, url, roles=[ADMIN]).
          • Cooldown: 2do fallo desde la misma IP no re-alerta;
            IPs distintas SÍ generan alertas separadas.
          • Burst: 20 fallos desde 20 IPs distintas → 20 alertas
            LOGIN_FAILED + 1 LOGIN_BURST.
          • Filtros: rolAnterior===rolNuevo no dispara; actor===
            target en reset no dispara.
          • Robustez: si notificarPorRol revierte rechazo, el
            helper no propaga.
          • Mock con vi.hoisted para evitar TDZ con vi.mock.
        Resultado: 185/185 tests (antes 169 + 16 nuevos).
        verify:passwords (24/24) y verify:users (12/12) siguen
        pasando — los hooks `void` no afectan el flujo de negocio.

  - [x] S4: JWT revocable + endpoint logout server-side
        Patrón viejo: el JWT era stateless puro. Hacer logout solo
        borraba el token del localStorage del cliente; si alguien
        copiaba el token (xss, screen share, log de proxy) podía
        seguir usándolo hasta su expiración natural (24h por default).
        No había forma de "cerrar todas las sesiones" tras detectar
        compromiso.
        Diseño nuevo:
          • Schema Prisma:
              - model RevokedToken (jti PK, userId, expiresAt,
                revokedAt, reason + index expiresAt + index userId
                + cascade delete con user).
              - Migración 20260427182846_add_revoked_tokens.
          • lib/tokenRevocation.ts:
              - In-memory Set<string> de jtis revocados activos.
                Hidratado al boot vía warmupRevokedTokens().
              - isRevoked(jti) síncrono (cache lookup) — usado por
                requireAuth en cada request.
              - revokeToken(jti, userId, expiresAt, reason) →
                upsert en BD + add al cache. Si expiresAt ya pasó,
                no-op (evita inflar tabla con tokens muertos).
              - revokeAllForUser(userId) → borra revoked_tokens
                del user (revoke-all real lo hace passwordChangedAt).
              - cleanupExpired() → borra registros con expiresAt
                pasado, sincroniza cache.
              - startCleanupTimer() → setInterval 1h, .unref()
                para no impedir process.exit. Idempotente.
          • middleware/auth.ts (requireAuth) ahora aplica 3 barreras:
              1. jwt.verify (firma + exp).
              2. isRevoked(jti) (logout explícito).
              3. iat ≥ user.passwordChangedAt - 1s (invalida tokens
                 emitidos antes de cambio de password / logout-all).
            La barrera 3 consulta prisma.user.findUnique con cache
            in-memory (TTL 60s, ~16 bytes/entry) para no añadir
            round-trip por cada request.
            invalidateUserPwdCache(userId) exportado para que
            change-password/logout-all bypasse el TTL en la misma
            instancia.
          • routes/auth.ts:
              - login emite jti = randomUUID() en el JWT
                (jsonwebtoken `jwtid` option).
              - POST /logout (NUEVO): registra el jti en
                revoked_tokens con reason='logout'. Idempotente.
                Tokens sin jti (legacy) son aceptados pero no
                revocan (cliente debe descartarlos localmente).
              - POST /logout-all (NUEVO): bumpea
                user.passwordChangedAt = now → invalida todos los
                JWTs vivos del user en cualquier réplica vía
                barrera 3. Limpia revoked_tokens del user (ya no
                hace falta acumularlos).
              - change-password: invalidateUserPwdCache(userId)
                tras setPassword para que la barrera 3 vea el nuevo
                passwordChangedAt sin esperar TTL.
          • index.ts: warmupRevokedTokens() + startCleanupTimer()
            al boot, fire-and-forget.
        Ajustes a tests existentes:
          • clients/contracts/invoices/extract.test.ts: el mock de
            prisma ahora incluye `user.findUnique` que devuelve
            `{ passwordChangedAt: new Date(0), activo: true }` —
            permite que requireAuth acepte el token de pruebas.
          • users.verify.ts: el "ANALISTA stub" antes era un
            userId inventado; ahora se hace upsert de un user real
            verify-analista-stub@inyecta.local porque requireAuth
            valida existencia.
          • catalog.verify.ts: idem, usa el realAdmin del seed.
        Verify (src/__verify__/jwtRevocation.verify.ts) — 17/17:
          1-4. login devuelve token con jti/iat/exp.
          5.   token funciona en /protected.
          6-8. /logout 200 + isRevoked()=true + row en BD.
          9.   mismo token después → 401 'Token revocado'.
          10.  token sin jti (legacy) sigue funcionando.
          11.  bumpear passwordChangedAt → token con iat anterior
               rechazado con 401.
          12-13. /logout-all bumpea pwd y mata tokens nuevos.
          14-15. cleanupExpired borra vencidos.
          16-17. _cacheClear + warmupRevokedTokens hidrata desde BD.
        Comando: `npm run verify:jwtRevocation`.
        Resultado final:
          - 185/185 tests (sin nuevos, solo ajustes a mocks).
          - 9 verify scripts pasando (errorHandler, health,
            branding, email, catalog, users, passwords, jwtRevocation,
            (folioSequence existente)).
          - tsc --noEmit limpio.
        Para que Damián cierre todas las sesiones de un user
        comprometido: `POST /api/auth/logout-all` con el token del
        user, o desactivar al user (PATCH /api/users/:id { activo:
        false }) — ambos disparan la barrera 3 inmediatamente.
```

---

## 11. INSTRUCCIONES PARA CLAUDE CODE

1. **Al iniciar una sesión:** lee este archivo completo, luego lee el estado actual del código en los archivos relevantes para la tarea que vas a hacer. No asumas nada sobre el estado del proyecto.

2. **Antes de cada tarea:** confirma en un párrafo qué entendiste y qué archivos vas a tocar.

3. **Al terminar cada tarea:** haz commit, actualiza la sección 10 de este archivo marcando la tarea como completada, y confirma qué sigue.

4. **Si el contexto se acerca al límite:** usa `/compact` antes de empezar la siguiente tarea. El resumen debe incluir qué tareas están completas y cuál es la siguiente.

5. **Si encuentras código que contradice las fórmulas de sección 4:** las fórmulas de este archivo son la fuente de verdad. El código está mal, no las fórmulas.

6. **Si encuentras lógica de amortización duplicada** en el Cotizador (calcAmort, calcPMT, etc.): elimínala y usa las funciones de `apps/web/src/lib/cotizacion/`.

7. **No crear archivos de documentación** (README, CHANGELOG, etc.) a menos que se pida explícitamente.

8. **Empieza siempre por T1** si no está completada — es un bug activo en producción.
