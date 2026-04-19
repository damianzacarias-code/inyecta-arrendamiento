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
  depositoGarantiaPct: number;          // % sobre baseBien (residual real en PURO)
  comisionAperturaPct: number;          // % sobre baseBien
  comisionAperturaFinanciada: boolean;
  valorResidualPct: number;             // espejo de depositoGarantiaPct en PURO; 0 en FIN
  rentaInicial: number;
  gpsInstalacion: number;
  gpsFinanciado: boolean;
  seguroAnual: number;
  seguroFinanciado: boolean;
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

export function calcularArrendamiento(params: LeaseParams): LeaseResult {
  const {
    producto, valorBien, plazo, tasaAnual,
    enganchePct, depositoGarantiaPct, comisionAperturaPct,
    comisionAperturaFinanciada,
    rentaInicial, gpsInstalacion, gpsFinanciado,
    seguroAnual, seguroFinanciado,
  } = params;

  // ── Montos base ───────────────────────────────────────────────────
  const valorSinIVA = new Decimal(valorBien);
  const valorConIVA = valorSinIVA.times(1 + IVA_RATE);
  const gps         = new Decimal(gpsInstalacion || 0);
  const tasaMensual = new Decimal(tasaAnual).dividedBy(12);

  const baseBien = valorSinIVA.plus(gpsFinanciado ? gps : 0);

  // ── Comisión, enganche, depósito ─────────────────────────────────
  const comisionApertura   = baseBien.times(comisionAperturaPct);
  const comisionFinanciada = comisionAperturaFinanciada ? comisionApertura : new Decimal(0);
  const comisionContado    = comisionAperturaFinanciada ? new Decimal(0) : comisionApertura;

  const enganche         = producto === 'FINANCIERO'
    ? valorConIVA.times(enganchePct)
    : new Decimal(0);
  const depositoGarantia = baseBien.times(depositoGarantiaPct);

  // Seguro: si financiado, NO se suma al montoFinanciado del PMT; se cobra
  // como parte del flujo (renta fija o prorrateado). El legacy lo sumaba al
  // monto financiado; nosotros lo mantenemos en el desembolso/total.
  const seguro = new Decimal(seguroAnual || 0);

  // ── Monto financiado (SIN IVA del bien) ──────────────────────────
  const montoFinanciado = baseBien.plus(comisionFinanciada).minus(enganche);

  // ── PMT: FV = depósito (PURO) o 0 (FINANCIERO) ───────────────────
  const fvPMT = producto === 'PURO' ? depositoGarantia : new Decimal(0);
  const rentaNeta = calcPMT(montoFinanciado, tasaMensual, plazo, fvPMT);

  // ── IVA de la renta ──────────────────────────────────────────────
  // CLAUDE.md §4.6 + regla 8: IVA = renta × 16% para AMBOS productos.
  const ivaRenta        = rentaNeta.times(IVA_RATE);
  const rentaMensualIVA = rentaNeta.plus(ivaRenta);
  const totalRentas     = rentaMensualIVA.times(plazo);

  // ── Desembolso inicial ────────────────────────────────────────────
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
    valorResidual:    r2(depositoGarantia), // en PURO residual = depósito; en FIN = 0 si pct=0
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
//   Regla legacy: 0.2% diario sobre el importe vencido.
//   Para mantener compatibilidad API aceptamos tasaAnualOrdinaria
//   pero la ignoramos: la tasa moratoria es fija por regulación interna.
// ═══════════════════════════════════════════════════════════════════

const TASA_MORATORIA_DIARIA = 0.002;

export function calcularMoratorios(
  rentaVencida: number,
  diasAtraso: number,
  _tasaAnualOrdinaria: number,
): { moratorio: number; ivaMoratorio: number; total: number } {
  const base = new Decimal(rentaVencida);
  const moratorio    = base.times(TASA_MORATORIA_DIARIA).times(diasAtraso);
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

export function generarOpcionesRiesgo(
  valorBien: number,
  plazo: number,
  tasaAnual: number,
  gps: number,
  comisionPct: number,
) {
  const niveles = [
    { nivel: 'A', nombre: 'Riesgo bajo',  depositoPuro: 0.16, depositoFin: 0.16, engancheFin: 0.00 },
    { nivel: 'B', nombre: 'Riesgo medio', depositoPuro: 0.21, depositoFin: 0.16, engancheFin: 0.05 },
    { nivel: 'C', nombre: 'Riesgo alto',  depositoPuro: 0.26, depositoFin: 0.16, engancheFin: 0.10 },
  ];

  const opciones = [];

  for (const nv of niveles) {
    // PURO
    const puro = calcularArrendamiento({
      producto: 'PURO',
      valorBien, plazo, tasaAnual,
      enganchePct: 0,
      depositoGarantiaPct: nv.depositoPuro,
      comisionAperturaPct: comisionPct,
      comisionAperturaFinanciada: true,
      valorResidualPct: nv.depositoPuro,
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
      enganchePct: nv.engancheFin,
      depositoGarantiaPct: nv.depositoFin,
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
