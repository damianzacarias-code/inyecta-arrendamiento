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

> Todas verificadas el 18-04-2026 contra `Cotización Inyecta Arrendamiento.xlsx`
> Producen exactamente los valores del PDF de referencia. NO modificar.

### 4.1 Variables de entrada

| Variable | Ejemplo | Notas |
|---|---|---|
| valorBienConIVA | $2,100,000.00 | Precio al cliente con IVA |
| tasaIVA | 0.16 | 16% |
| tasaAnual | 0.36 | **36% anual = 3% mensual** — tasa estándar Inyecta |
| plazo | 48 | meses |
| tasaComisionApertura | 0.05 | 5% sobre baseBien |
| porcentajeResidual | 0.16 (PURO) / 0.02 (FIN) | ver uso abajo |
| gpsMonto | $16,000 | si es financiado |
| tasaMoratoriaAnual | 0.72 | 72% anual = 0.2% diario base 360 |

### 4.2 Cálculos en orden estricto

```
valorSinIVA     = valorConIVA / 1.16
                = $2,100,000 / 1.16 = $1,810,344.83 ✓

baseBien        = valorSinIVA + gpsFinanciado
                = $1,810,344.83 + $16,000 = $1,826,344.83 ✓

comisionApertura = baseBien × tasaComisionApertura
                 = $1,826,344.83 × 0.05 = $91,317.24 ✓

montoFinanciadoReal = baseBien + comisionAperturaFinanciada
                    = $1,826,344.83 + $91,317.24 = $1,917,662.07 ✓
                    ← ESTE es el PV que entra al PMT (sin IVA del bien)

depositoGarantia = baseBien × porcentajeResidual
                 = $1,826,344.83 × 0.16 = $292,215.17 ✓
```

### 4.3 PMT — Fórmula verificada

```
PURO:       FV_pmt = depositoGarantia = $292,215.17
            renta  = PMT(3%, 48, -1,917,662.07, 292,215.17) = $73,098.02 ✓

FINANCIERO: FV_pmt = 0  (amortiza TODO el capital)
            renta  = PMT(3%, 48, -1,917,662.07, 0) = $75,896.80 ✓

PMT = (PV × r × (1+r)^n - FV × r) / ((1+r)^n - 1)
donde r = tasaAnual / 12
```

### 4.4 Monto a financiar (DISPLAY en cotización — diferente al PMT)

```
montoTotalDisplay = valorConIVA + comisionFinanciada + gpsFinanciado + seguro - enganche
                  = $2,100,000 + $91,317.24 + $16,000 = $2,207,317.24 ✓
                  ← Solo para mostrar al cliente, NO entra al PMT
```

### 4.5 Residual DISPLAY (sección 4 de la cotización)

```
PURO:       valorRescate_display = montoTotalDisplay × 0.16
                                 = $2,207,317.24 × 0.16 = $353,170.76 ✓
            IVA rescate          = $353,170.76 × 0.16   = $56,507.32 ✓
            Total rescate        = $353,170.76 × 1.16   = $409,678.08 ✓

FINANCIERO: opcionCompra_display = montoTotalDisplay × 0.02
                                 = $2,207,317.24 × 0.02 = $44,146.34 ✓
            IVA opcion           = $44,146.34 × 0.16    = $7,063.42 ✓
            Total opcion         = $44,146.34 × 1.16    = $51,209.76 ✓
```

### 4.6 IVA de la renta

```
IVA_renta = renta × 0.16
PURO:       $73,098.02 × 0.16 = $11,695.68 ✓
FINANCIERO: $75,896.80 × 0.16 = $12,143.49 ✓
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

Interés_n = Saldo_n × (tasaAnual/12)
Capital_n = PMT - Interés_n   (última fila: capital = saldo exacto)
Saldo_n   = Saldo_{n-1} - Capital_n   (última fila = 0.00 exacto)
IVA_n     = Renta × 0.16   (= PMT × 0.16, no solo sobre interés)
Total_n   = Capital_n + Interés_n + IVA_n

Verificación período 1:
  Saldo inicial:  $1,917,662.07
  Interés p1:     $1,917,662.07 × 0.03 = $57,529.86 ✓
  Capital p1:     $73,098.02 - $57,529.86 = $15,568.16 ✓
  Saldo p1:       $1,917,662.07 - $15,568.16 = $1,902,093.91 ✓
  Saldo p48:      $292,215.17 ✓
```

### 4.9 Moratorios

```
interesMoratorio = saldoInsoluto × (tasaMoratoriaAnual / 360) × diasAtraso
ivaMoratorio     = interesMoratorio × 0.16
tasaMoratoriaAnual estándar = 0.72 (72%)

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

2. **El monto que entra al PMT** es `valorSinIVA + gpsFinanciado + comisionAperturaFinanciada` (sin IVA del bien). El IVA del bien no se financia en arrendamiento puro ni financiero.

3. **PURO no tiene desglose Capital/Interés** en su tabla de amortización al cliente. Solo muestra Período, Fecha, Renta, IVA, Total.

4. **PURO: FV del PMT = depósito en garantía** (baseBien × 16%). Ese saldo queda al final de los 48 pagos.

5. **FINANCIERO: FV del PMT = 0**. La opción de compra (2%) es solo un precio simbólico que se muestra en la cotización, no entra al PMT.

6. **La última fila de amortización** debe usar `capital = saldoRestante` exacto (no `PMT - interés`), para garantizar que el saldo final sea exactamente $0.00 sin residuo de redondeo.

7. **addMeses()** es obligatorio para calcular fechas. Nunca usar `setMonth()` directamente.

8. **IVA en tablas** = renta × 0.16 para ambos productos (per Excel de Inyecta, incluyendo FINANCIERO).

9. **Pagos adicionales**: PURO usa Rentas Prorrateadas (no hay deducción de capital — solo redistribución de rentas). FINANCIERO usa Rentas Anticipadas (abona a capital, recalcula PMT).

10. **Prelación legal México**: moratorios → IVA moratorios → intereses → IVA intereses → capital.

11. **Tasa moratoria estándar**: 72% anual. Campo obligatorio por operación, sin default en UI.

12. **Comisión de apertura**: 5% sobre (valorSinIVA + gpsFinanciado). Se puede financiar o cobrar de contado.

13. **Depósito en garantía**: baseBien × porcentajeResidual. No es meses de renta — es porcentaje del bien.

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
