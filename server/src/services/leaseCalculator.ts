/**
 * Motor de cálculo de arrendamiento — Inyecta SOFOM
 * ---------------------------------------------------------------
 * Replica EXACTA de la lógica validada en el cliente
 * (client/src/lib/cotizacion/calculos.ts + amortizacion.ts).
 *
 * Modelo financiero (validado al centavo contra Excels de referencia):
 *
 *   valorSinIVA       = precio del bien ANTES de IVA
 *   valorConIVA       = valorSinIVA × 1.16
 *   baseBien          = valorSinIVA + (gpsFinanciado ? gps : 0)
 *                       ← base para comisión y depósito
 *   comisionApertura  = baseBien × comisionAperturaPct
 *   depositoGarantia  = baseBien × depositoGarantiaPct     (PURO: residual real)
 *   enganche          = valorConIVA × enganchePct          (FINANCIERO)
 *   montoFinanciado   = baseBien + (comisionFin ? comisión : 0)   ← SIN IVA del bien
 *                       ← el que entra al PMT
 *   fvPMT             = PURO → depositoGarantia, FIN → 0
 *   rentaNeta         = PMT(tasaMensual, plazo, −montoFinanciado, fvPMT)
 *
 * IVA (CLAUDE.md §4.6/§4.8 + regla 8 — fuente de verdad: Excel Inyecta):
 *   PURO       → IVA = renta × 16%
 *   FINANCIERO → IVA = renta × 16%   (AMBOS gravan la renta completa,
 *                                    según la práctica operativa de Inyecta;
 *                                    NO solo el interés como dicta el Art 18-A LIVA).
 *
 * Decimal.js con precision 20 + ROUND_HALF_UP para evitar drift.
 */
import Decimal from 'decimal.js';

Decimal.set({ precision: 20, rounding: Decimal.ROUND_HALF_UP });

// ═══════════════════════════════════════════════════════════════════
// Interfaces públicas (compatibilidad con quotations.ts)
// ═══════════════════════════════════════════════════════════════════

export interface LeaseParams {
  producto: 'PURO' | 'FINANCIERO';
  valorBien: number;                    // SIN IVA
  plazo: number;                        // meses (12-48)
  tasaAnual: number;                    // e.g. 0.36
  enganchePct: number;                  // FINANCIERO: % sobre valorConIVA
  /** §4.12: depósito en garantía (FV del PMT en PURO). */
  depositoGarantiaPct: number;
  comisionAperturaPct: number;          // % sobre baseBien
  comisionAperturaFinanciada: boolean;
  /**
   * §4.12: solo PURO — porcentaje sobre baseBien para el valor residual
   * display (precio simbólico al cierre). En FIN se ignora (motor usa
   * 2% per §4.5).
   */
  valorResidualPct: number;
  /**
   * §4.13: solo PURO — si true, valorResidualResuelto = depositoGarantia
   * (el cliente "pierde" el depósito a cambio del bien al final). En FIN
   * se ignora. Reemplaza el campo legacy `valorResidualEsComision`.
   */
  valorResidualEsDeposito?: boolean;
  rentaInicial: number;
  gpsInstalacion: number;
  gpsFinanciado: boolean;
  seguroAnual: number;
  seguroFinanciado: boolean;
  /**
   * §4.14: si true, el seguro NO entra en B17 ni en la renta hasta
   * que se especifique un monto. (Default false para compat.)
   */
  seguroPendiente?: boolean;
}

export interface AmortizationRow {
  periodo: number;
  fecha: Date;
  saldoInicial: number;
  intereses: number;
  pagoCapital: number;
  renta: number;
  iva: number;
  seguro: number;
  pagoTotal: number;
  saldoFinal: number;
}

export interface LeaseResult {
  valorBienIVA: number;
  enganche: number;
  depositoGarantia: number;
  comisionApertura: number;
  valorResidual: number;
  montoFinanciar: number;
  rentaMensual: number;
  ivaRenta: number;
  rentaMensualIVA: number;
  totalRentas: number;
  desembolsoInicial: number;
  totalPagar: number;
  ganancia: number;
  amortizacion: AmortizationRow[];
}

const IVA_RATE = 0.16;

// ═══════════════════════════════════════════════════════════════════
// PMT — amortización francesa con FV opcional
// PMT = (P·r·(1+r)^n − FV·r) / ((1+r)^n − 1)
// ═══════════════════════════════════════════════════════════════════

function calcPMT(
  capital: Decimal,
  tasaMensual: Decimal,
  periodos: number,
  valorFuturo: Decimal,
): Decimal {
  if (tasaMensual.isZero()) {
    return capital.minus(valorFuturo).dividedBy(periodos);
  }
  const factor = tasaMensual.plus(1).pow(periodos);
  return capital
    .times(tasaMensual)
    .times(factor)
    .minus(valorFuturo.times(tasaMensual))
    .dividedBy(factor.minus(1));
}

// ═══════════════════════════════════════════════════════════════════
// Motor principal
// ═══════════════════════════════════════════════════════════════════

/**
 * Calcula la cotización completa de arrendamiento (PURO o FINANCIERO)
 * en el servidor — espejo de `client/src/lib/cotizacion/calculos.ts`.
 *
 * Verificado al centavo contra el Excel de Inyecta (CLAUDE.md §4).
 * Este motor lo consume `routes/quotations.ts` para POST /simulate y
 * para persistir la cotización al guardar; el cliente lo replica para
 * preview en vivo en el Cotizador (sin round-trip).
 *
 * NOTA importante sobre `valorBien`: aquí entra SIN IVA (valorSinIVA).
 * En el cliente entra CON IVA y la división `/1.16` la hace el motor.
 * Mantener consistencia con `routes/quotations.ts` antes de cambiar.
 *
 * Diferencias clave PURO vs FINANCIERO (CLAUDE.md regla 4-5):
 *   - PURO       → FV PMT = depósito (16%), no amortiza el bien.
 *   - FINANCIERO → FV PMT = 0, amortiza todo el capital, opción de
 *                  compra simbólica (2%) solo display.
 *
 * @param params  parámetros del bien, financiamiento, GPS y seguro.
 * @returns       resumen de cifras + tabla de amortización completa
 *                + 6 escenarios (3 riesgos × 2 productos) cuando aplique.
 */
export function calcularArrendamiento(params: LeaseParams): LeaseResult {
  const {
    producto, valorBien, plazo, tasaAnual,
    enganchePct, depositoGarantiaPct, comisionAperturaPct,
    comisionAperturaFinanciada,
    valorResidualPct, valorResidualEsDeposito,
    rentaInicial, gpsInstalacion, gpsFinanciado,
    seguroAnual, seguroFinanciado, seguroPendiente,
  } = params;

  // ── Montos base ───────────────────────────────────────────────────
  const valorSinIVA = new Decimal(valorBien);
  const valorConIVA = valorSinIVA.times(1 + IVA_RATE);
  const gps         = new Decimal(gpsInstalacion || 0);
  const tasaMensual = new Decimal(tasaAnual).dividedBy(12);

  // ── Enganche (siempre reduce baseBien per Excel B17) ─────────────
  // CLAUDE.md §4.2: B17 = valorSinIVA - enganche + gpsFinanciado +
  // seguroAnual×plazo/12 (si financiado).
  // CLAUDE.md §4.2 + 27-04-2026: el enganche se aplica a TODOS los
  // productos (PURO y FIN) sobre valorSinIVA, no sólo a FIN.
  // Antes: PURO siempre 0 (regla legacy A=B=C=0% en presets viejos).
  // Tras la regla "Bajo/Medio/Alto" todos los niveles pueden tener
  // enganche según la distribución del aporte inicial — ver
  // services/distribucion.ts.
  const enganche = valorSinIVA.times(enganchePct);

  // ── Seguro (CLAUDE.md §4.14) ─────────────────────────────────────
  // - seguroPendiente: 0 en B17 y 0 en pago inicial (no entra hasta
  //   que se especifique el monto).
  // - financiado:     suma seguroAnual × plazo/12 a B17 (total del
  //   seguro durante toda la vigencia del contrato).
  // - contado:        cliente paga seguroAnual al inicio (anualidad).
  const seguro = seguroPendiente
    ? new Decimal(0)
    : new Decimal(seguroAnual || 0);
  const seguroFinanciadoTotal = seguroFinanciado
    ? seguro.times(plazo).dividedBy(12)
    : new Decimal(0);

  // ── Base del bien (B17) — para comisión y depósito ───────────────
  // CLAUDE.md §4.2: B17 = valorSinIVA - enganche + gpsFinanciado +
  // seguroAnual×plazo/12 (si financiado).
  const baseBien = valorSinIVA
    .minus(enganche)
    .plus(gpsFinanciado ? gps : 0)
    .plus(seguroFinanciadoTotal);

  // ── Comisión, depósito ───────────────────────────────────────────
  const comisionApertura   = baseBien.times(comisionAperturaPct);
  const comisionFinanciada = comisionAperturaFinanciada ? comisionApertura : new Decimal(0);
  const comisionContado    = comisionAperturaFinanciada ? new Decimal(0) : comisionApertura;

  const depositoGarantia = baseBien.times(depositoGarantiaPct);

  // ── Valor residual (CLAUDE.md §4.12 + §4.13 + §4.5) ──────────────
  //   PURO  : si valorResidualEsDeposito ⇒ = depósito en garantía
  //             (cliente pierde el depósito a cambio del bien),
  //           si no ⇒ baseBien × valorResidualPct.
  //   FIN   : baseBien × 0.02 (precio simbólico — opción de compra).
  const valorResidual =
    producto === 'PURO'
      ? (valorResidualEsDeposito
          ? depositoGarantia
          : baseBien.times(valorResidualPct))
      : baseBien.times(0.02);

  // ── PV del PMT / monto financiado (B19) — SIN IVA del bien ───────
  // B19 = B17 + comisiónFinanciada. El enganche YA está restado en B17.
  const montoFinanciado = baseBien.plus(comisionFinanciada);

  // ── PMT: FV = valor residual (PURO) o 0 (FINANCIERO) ─────────────
  // BUG FIX 28-04-2026 (Damián): antes pasaba `depositoGarantia` como
  // FV del PMT, ignorando el `valorResidual` ya calculado arriba. Eso
  // inflaba la renta cuando residual ≠ depósito (16% vs 10%) y dejaba
  // la amortización terminando en el depósito en lugar del residual
  // mostrado al cliente. Verificado al centavo contra Excel oficial.
  // `valorResidual` ya cubre los dos casos:
  //   • valorResidualEsDeposito = true (§4.13) → vale `depositoGarantia`
  //   • si no                                  → vale `baseBien × valorResidualPct`
  const fvPMT = producto === 'PURO' ? valorResidual : new Decimal(0);
  const rentaNeta = calcPMT(montoFinanciado, tasaMensual, plazo, fvPMT);

  // ── IVA de la renta ──────────────────────────────────────────────
  // CLAUDE.md §4.6 + regla 8: IVA = renta × 16% para AMBOS productos.
  const ivaRenta        = rentaNeta.times(IVA_RATE);
  const rentaMensualIVA = rentaNeta.plus(ivaRenta);
  const totalRentas     = rentaMensualIVA.times(plazo);

  // ── Desembolso inicial ────────────────────────────────────────────
  // El seguro contado entra como anualidad (no como total prorrateado).
  const desembolsoInicial = enganche
    .plus(depositoGarantia)
    .plus(comisionContado)
    .plus(gpsFinanciado ? 0 : gps)
    .plus(seguroFinanciado ? 0 : seguro)
    .plus(rentaInicial || 0);

  const totalPagar = totalRentas.plus(desembolsoInicial);
  const ganancia   = totalPagar.minus(valorConIVA);

  // ── Tabla de amortización ─────────────────────────────────────────
  const amortizacion = generarAmortizacion({
    producto,
    montoFinanciado,
    tasaMensual,
    plazo,
    rentaNeta,
    fvResidual: fvPMT,
    fechaInicio: new Date(),
  });

  return {
    valorBienIVA:     r2(valorConIVA),
    enganche:         r2(enganche),
    depositoGarantia: r2(depositoGarantia),
    comisionApertura: r2(comisionApertura),
    valorResidual:    r2(valorResidual), // §4.12: separado del depósito
    montoFinanciar:   r2(montoFinanciado),
    rentaMensual:     r2(rentaNeta),
    ivaRenta:         r2(ivaRenta),
    rentaMensualIVA:  r2(rentaMensualIVA),
    totalRentas:      r2(totalRentas),
    desembolsoInicial: r2(desembolsoInicial),
    totalPagar:       r2(totalPagar),
    ganancia:         r2(ganancia),
    amortizacion,
  };
}

// ═══════════════════════════════════════════════════════════════════
// Tabla de amortización unificada
// ═══════════════════════════════════════════════════════════════════

interface AmortArgs {
  producto: 'PURO' | 'FINANCIERO';
  montoFinanciado: Decimal;
  tasaMensual: Decimal;
  plazo: number;
  rentaNeta: Decimal;
  fvResidual: Decimal;      // saldo remanente tras la última fila (PURO: depósito; FIN: 0)
  fechaInicio: Date;
}

function generarAmortizacion(a: AmortArgs): AmortizationRow[] {
  const { montoFinanciado, tasaMensual, plazo, rentaNeta, fvResidual, fechaInicio } = a;
  const rows: AmortizationRow[] = [];
  let saldo = montoFinanciado;

  for (let i = 1; i <= plazo; i++) {
    const esUltima = i === plazo;
    const saldoInicial = saldo;
    const interes      = saldo.times(tasaMensual);

    // Capital:
    //  - última fila: lo que falte para dejar saldo = fvResidual
    //  - resto: PMT − interés
    const capital = esUltima
      ? saldo.minus(fvResidual)
      : rentaNeta.minus(interes);

    const nuevoSaldo = esUltima ? fvResidual : saldo.minus(capital);

    // IVA = renta × 16% para AMBOS productos
    // (CLAUDE.md §4.6/§4.8 + regla 8 — práctica operativa de Inyecta)
    const iva = rentaNeta.times(IVA_RATE);

    const pagoTotal = rentaNeta.plus(iva);

    const fecha = addMeses(fechaInicio, i - 1);

    rows.push({
      periodo:      i,
      fecha,
      saldoInicial: r2(saldoInicial),
      intereses:    r2(interes),
      pagoCapital:  r2(capital),
      renta:        r2(rentaNeta),
      iva:          r2(iva),
      seguro:       0,
      pagoTotal:    r2(pagoTotal),
      saldoFinal:   r2(nuevoSaldo),
    });

    saldo = nuevoSaldo;
  }

  return rows;
}

// ═══════════════════════════════════════════════════════════════════
// Intereses moratorios
//   Tasa moratoria DINÁMICA = 2 × tasa ordinaria del contrato
//   (CLAUDE.md §4.9). Base del cálculo: renta pendiente sin IVA del
//   periodo en mora, NO saldo insoluto general.
// ═══════════════════════════════════════════════════════════════════

/**
 * Cálculo de intereses moratorios para una renta vencida.
 *
 * Fórmula (CLAUDE.md §4.9):
 *   tasaMoratoriaAnual  = tasaAnualOrdinaria × 2          (dinámica)
 *   tasaMoratoriaDiaria = tasaMoratoriaAnual / 360
 *   moratorio           = rentaVencidaSinIVA × tasaMoratoriaDiaria × diasAtraso
 *   ivaMoratorio        = moratorio × 16%
 *   total               = moratorio + ivaMoratorio
 *
 * Ejemplos:
 *   - Contrato @ 36% ord → moratoria 72%/360 = 0.2%/día.
 *   - Contrato @ 24% ord → moratoria 48%/360 = 0.1333%/día.
 *
 * La base es la renta pendiente **SIN IVA** del periodo en mora
 * (G − K/1.16 en el Excel hoja "Pagos" col M), no el saldo insoluto
 * general del contrato.
 *
 * Para cobranza real (saldo insoluto + prelación legal moratorio →
 * IVA mor → interés → IVA → capital), ver `routes/cobranza.ts`, que
 * deriva su tasa moratoria del contrato y resta moratorio ya cobrado.
 *
 * @param rentaVencidaSinIVA   monto neto SIN IVA de la renta atrasada.
 * @param diasAtraso           días desde el vencimiento (entero ≥ 0).
 * @param tasaAnualOrdinaria   tasa ordinaria del contrato (ej. 0.36).
 * @returns                    {moratorio, ivaMoratorio, total} en MXN.
 */
export function calcularMoratorios(
  rentaVencidaSinIVA: number,
  diasAtraso: number,
  tasaAnualOrdinaria: number,
): { moratorio: number; ivaMoratorio: number; total: number } {
  const base = new Decimal(rentaVencidaSinIVA);
  const tasaMoratoriaAnual = new Decimal(tasaAnualOrdinaria).times(2);
  const tasaDiaria = tasaMoratoriaAnual.div(360);
  const moratorio    = base.times(tasaDiaria).times(diasAtraso);
  const ivaMoratorio = moratorio.times(IVA_RATE);
  return {
    moratorio:    r2(moratorio),
    ivaMoratorio: r2(ivaMoratorio),
    total:        r2(moratorio.plus(ivaMoratorio)),
  };
}

// ═══════════════════════════════════════════════════════════════════
// Opciones de riesgo (3 niveles × 2 productos = 6 escenarios)
// ═══════════════════════════════════════════════════════════════════

/**
 * Preset de un nivel de riesgo. Espejo de la tabla `risk_presets` del
 * server. Lo declaramos local para que esta función NO dependa de
 * Prisma (sigue siendo pura, testeable sin BD). El llamador puede:
 *   • pasar el array desde BD (`prisma.riskPreset.findMany`)
 *   • pasar `undefined` y dejar que use los defaults históricos
 *     (útil en tests y en arranques sin migrar).
 */
export interface RiskPresetInput {
  nivel: 'A' | 'B' | 'C' | string;
  nombre: string;
  engachePuroPct: number;
  depositoPuroPct: number;
  engancheFinPct: number;
  depositoFinPct: number;
  orden?: number;
}

/** Defaults históricos. Coinciden con el seed de la migración. */
const DEFAULT_RISK_PRESETS: RiskPresetInput[] = [
  { nivel: 'A', nombre: 'Riesgo bajo',  engachePuroPct: 0, depositoPuroPct: 0.16, engancheFinPct: 0.00, depositoFinPct: 0.16, orden: 1 },
  { nivel: 'B', nombre: 'Riesgo medio', engachePuroPct: 0, depositoPuroPct: 0.21, engancheFinPct: 0.05, depositoFinPct: 0.16, orden: 2 },
  { nivel: 'C', nombre: 'Riesgo alto',  engachePuroPct: 0, depositoPuroPct: 0.26, engancheFinPct: 0.10, depositoFinPct: 0.16, orden: 3 },
];

/**
 * Genera 6 escenarios (3 niveles de riesgo × 2 productos) para que el
 * ejecutivo le presente al cliente alternativas comparables.
 *
 * Antes los porcentajes vivían como literales en esta función. Ahora se
 * leen de la tabla `risk_presets` (con fallback a defaults históricos
 * si el llamador no pasa nada) — ADMIN/DIRECTOR los puede ajustar
 * desde /admin/catalogo sin redeploy.
 *
 * @param valorBien    valor SIN IVA del bien.
 * @param plazo        meses (12..48).
 * @param tasaAnual    decimal (ej: 0.36 = 36%).
 * @param gps          monto GPS — siempre financiado en estos escenarios.
 * @param comisionPct  comisión apertura — siempre financiada.
 * @param presets      opcional: lista de presets desde BD.
 *                     Si se omite, usa DEFAULT_RISK_PRESETS.
 * @returns            array de 6 cotizaciones con `{producto, nivel, ...resultado}`.
 */
export function generarOpcionesRiesgo(
  valorBien: number,
  plazo: number,
  tasaAnual: number,
  gps: number,
  comisionPct: number,
  presets?: RiskPresetInput[],
) {
  const niveles = (presets && presets.length > 0 ? presets : DEFAULT_RISK_PRESETS)
    .slice()
    .sort((a, b) => (a.orden ?? 0) - (b.orden ?? 0));

  const opciones = [];

  for (const nv of niveles) {
    // PURO
    const puro = calcularArrendamiento({
      producto: 'PURO',
      valorBien, plazo, tasaAnual,
      enganchePct: nv.engachePuroPct,
      depositoGarantiaPct: nv.depositoPuroPct,
      comisionAperturaPct: comisionPct,
      comisionAperturaFinanciada: true,
      valorResidualPct: nv.depositoPuroPct,
      rentaInicial: 0,
      gpsInstalacion: gps,
      gpsFinanciado: true,
      seguroAnual: 0,
      seguroFinanciado: true,
    });

    opciones.push({
      nombre: `Puro - Nivel ${nv.nivel} (${nv.nombre})`,
      producto: 'PURO' as const,
      nivelRiesgo: nv.nivel,
      ...puro,
    });

    // FINANCIERO
    const financiero = calcularArrendamiento({
      producto: 'FINANCIERO',
      valorBien, plazo, tasaAnual,
      enganchePct: nv.engancheFinPct,
      depositoGarantiaPct: nv.depositoFinPct,
      comisionAperturaPct: comisionPct,
      comisionAperturaFinanciada: true,
      valorResidualPct: 0,
      rentaInicial: 0,
      gpsInstalacion: gps,
      gpsFinanciado: true,
      seguroAnual: 0,
      seguroFinanciado: true,
    });

    opciones.push({
      nombre: `Financiero - Nivel ${nv.nivel} (${nv.nombre})`,
      producto: 'FINANCIERO' as const,
      nivelRiesgo: nv.nivel,
      ...financiero,
    });
  }

  return opciones;
}

/**
 * Helper async que carga los presets de la BD y llama a
 * `generarOpcionesRiesgo`. Si la BD está vacía o falla la lectura,
 * cae a defaults sin romper el flujo de cotización.
 *
 * Pensado para los handlers de quotations que ya viven en un contexto
 * async — no mete a Prisma en el motor puro de cálculo.
 */
export async function generarOpcionesRiesgoConBd(
  prisma: { riskPreset: { findMany: (args: { orderBy: { orden: 'asc' } }) => Promise<Array<{
    nivel: string;
    nombre: string;
    engachePuroPct: { toNumber(): number } | string | number;
    depositoPuroPct: { toNumber(): number } | string | number;
    engancheFinPct:  { toNumber(): number } | string | number;
    depositoFinPct:  { toNumber(): number } | string | number;
    orden: number;
  }>> } },
  valorBien: number,
  plazo: number,
  tasaAnual: number,
  gps: number,
  comisionPct: number,
) {
  const toNum = (d: { toNumber(): number } | string | number): number => {
    if (typeof d === 'number') return d;
    if (typeof d === 'string') return Number(d);
    return d.toNumber();
  };
  let presets: RiskPresetInput[] | undefined;
  try {
    const rows = await prisma.riskPreset.findMany({ orderBy: { orden: 'asc' } });
    if (rows.length > 0) {
      presets = rows.map((r) => ({
        nivel: r.nivel,
        nombre: r.nombre,
        engachePuroPct:  toNum(r.engachePuroPct),
        depositoPuroPct: toNum(r.depositoPuroPct),
        engancheFinPct:  toNum(r.engancheFinPct),
        depositoFinPct:  toNum(r.depositoFinPct),
        orden: r.orden,
      }));
    }
  } catch {
    // fallback silencioso: si la lectura falla (BD recién migrada,
    // permisos, etc.) seguimos con los defaults históricos en lugar
    // de tumbar la cotización.
  }
  return generarOpcionesRiesgo(valorBien, plazo, tasaAnual, gps, comisionPct, presets);
}

// ═══════════════════════════════════════════════════════════════════
// Helpers
// ═══════════════════════════════════════════════════════════════════

function addMeses(base: Date, meses: number): Date {
  const totalMeses = base.getMonth() + meses;
  const yr  = base.getFullYear() + Math.floor(totalMeses / 12);
  const mo  = ((totalMeses % 12) + 12) % 12;
  const dia = base.getDate();
  const maxDia = new Date(yr, mo + 1, 0).getDate();
  return new Date(yr, mo, Math.min(dia, maxDia), 12, 0, 0);
}

function r2(d: Decimal): number {
  return d.toDecimalPlaces(2, Decimal.ROUND_HALF_UP).toNumber();
}
