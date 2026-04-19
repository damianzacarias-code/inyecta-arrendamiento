/**
 * Cálculo financiero de cotizaciones — Inyecta Arrendamiento
 * ---------------------------------------------------------------
 * Fórmulas verificadas al centavo contra el Excel original de Inyecta
 * (tasa = 36%, plazo = 48, valor con IVA = $2,100,000, GPS = $16,000):
 *
 *   PURO:       renta = $73,098.02  |  depósito = $292,215.17
 *   FINANCIERO: renta = $75,896.80
 *
 * Todo pasa por Decimal.js — ningún operador `number` nativo en la ruta
 * de cálculo. El redondeo final a 2 decimales usa ROUND_HALF_UP.
 */
import Decimal from 'decimal.js';

Decimal.set({ precision: 20, rounding: Decimal.ROUND_HALF_UP });

// ═══════════════════════════════════════════════════════════════════
// PMT — amortización francesa
// ═══════════════════════════════════════════════════════════════════

/**
 * PMT — pago mensual fijo (amortización francesa)
 *
 * @param tasaAnual  tasa anual decimal (ej: 0.36 = 36%)
 * @param plazo      número de períodos mensuales
 * @param pv         valor presente (monto a financiar, positivo)
 * @param fv         valor futuro / residual (positivo, default 0)
 * @returns          renta mensual (positivo)
 */
export function calcPMT(
  tasaAnual: number,
  plazo: number,
  pv: number,
  fv = 0,
): number {
  const r = new Decimal(tasaAnual).dividedBy(12);
  const P = new Decimal(pv);
  const FV = new Decimal(fv);

  if (r.isZero()) {
    return P.minus(FV)
      .dividedBy(plazo)
      .toDecimalPlaces(2, Decimal.ROUND_HALF_UP)
      .toNumber();
  }

  const factor = r.plus(1).pow(plazo);
  //   PMT = (P·r·(1+r)^n − FV·r) / ((1+r)^n − 1)
  const pmt = P.times(r)
    .times(factor)
    .minus(FV.times(r))
    .dividedBy(factor.minus(1));

  return pmt.toDecimalPlaces(2, Decimal.ROUND_HALF_UP).toNumber();
}

// ═══════════════════════════════════════════════════════════════════
// Inputs / Outputs
// ═══════════════════════════════════════════════════════════════════

export interface InputsCotizacion {
  // ── Bien ─────────────────────────────────────────────────────────
  /** Precio total del bien CON IVA (ej: 2,100,000) */
  valorBienConIVA: number;
  /** Tasa de IVA decimal (ej: 0.16) */
  tasaIVA: number;

  // ── Producto ─────────────────────────────────────────────────────
  producto: 'PURO' | 'FINANCIERO';
  /** Plazo en meses (12, 18, 24, 30, 36, 42, 48) */
  plazo: number;
  /** Tasa anual decimal (ej: 0.36 = 36%) */
  tasaAnual: number;

  // ── Comisión por apertura ────────────────────────────────────────
  /** Ej: 0.05 = 5% sobre (valorSinIVA + gpsFinanciado) */
  tasaComisionApertura: number;
  /** true = pago inicial / false = financiada */
  comisionAperturaEsContado: boolean;

  // ── Valor residual / Opción de compra ────────────────────────────
  /**
   * PURO:       porcentaje que se usa como FV en el PMT
   *   → FV  = (valorSinIVA + gpsFinanciado) × porcentajeResidual
   * FINANCIERO: el FV del PMT es 0 (amortiza todo el capital)
   *   → el porcentaje solo se usa para el monto DISPLAY en la sección
   *     "Opción de compra" (cálculo: porcentaje × montoDisplay)
   */
  porcentajeResidual: number;

  // ── GPS ──────────────────────────────────────────────────────────
  gpsMonto: number;
  gpsEsContado: boolean;

  // ── Seguro ───────────────────────────────────────────────────────
  seguroMonto: number;
  seguroEsContado: boolean;

  // ── Enganche / Pago anticipado ───────────────────────────────────
  engancheMonto: number;
  /** true = pago inicial / false = reduce el monto a financiar */
  engancheEsContado: boolean;

  // ── Datos descriptivos ───────────────────────────────────────────
  nombreBien: string;
  estadoBien: string;        // "Nuevo" | "Seminuevo"
  seguroEstado: string;      // "Pendiente", "Contratado", etc.
  nombreCliente: string;

  /** Fecha de la cotización */
  fecha: Date;
}

export interface ResultadoCotizacion {
  // ── Encabezado ──────────────────────────────────────────────────
  fecha: string;              // "DD-MM-YYYY"
  nombreCliente: string;
  valorBienConIVA: number;
  valorBienSinIVA: number;
  nombreBien: string;
  estadoBien: string;
  seguroEstado: string;
  producto: 'PURO' | 'FINANCIERO';
  plazo: number;

  // ── Sección 1: Monto a financiar (DISPLAY, con IVA del bien) ─────
  monto: {
    valorBienSinIVA: number;
    valorBienConIVA: number;
    comisionAperturaFinanciada: number;
    seguroFinanciado: number;
    gpsFinanciado: number;
    descuentoEnganche: number;
    total: number;            // suma de todo lo anterior
  };

  // ── Sección 2: Pago inicial ──────────────────────────────────────
  pagoInicial: {
    engancheContado: number;
    comisionAperturaContado: number;
    aperturaSeguros: number;
    depositoGarantia: number;  // = baseBien × porcentajeResidual
    gpsContado: number;
    total: number;
  };

  // ── Sección 3: Renta mensual ─────────────────────────────────────
  rentaMensual: {
    montoNeto: number;
    iva: number;
    total: number;
  };

  // ── Sección 4: Residual DISPLAY ──────────────────────────────────
  residual: {
    etiqueta: string;          // "Valor de rescate" | "Opcion de compra"
    porcentaje: number;
    monto: number;             // = porcentaje × montoTotalDisplay
    iva: number;
    total: number;
  };

  // ── Campos técnicos para la tabla de amortización ────────────────
  /** Monto real financiado (SIN IVA del bien) usado para PMT */
  montoFinanciadoReal: number;
  /** FV del PMT: = depósito en PURO, = 0 en FINANCIERO */
  fvAmortizacion: number;
}

// ═══════════════════════════════════════════════════════════════════
// Motor principal
// ═══════════════════════════════════════════════════════════════════

export function calcularCotizacion(inp: InputsCotizacion): ResultadoCotizacion {
  const IVA = new Decimal(inp.tasaIVA);

  // ── Bien ─────────────────────────────────────────────────────────
  const valorConIVA = new Decimal(inp.valorBienConIVA);
  const valorSinIVA = valorConIVA.dividedBy(IVA.plus(1));

  // ── GPS ──────────────────────────────────────────────────────────
  const gpsFinanciado = inp.gpsEsContado ? new Decimal(0) : new Decimal(inp.gpsMonto);
  const gpsContado    = inp.gpsEsContado ? new Decimal(inp.gpsMonto) : new Decimal(0);

  // ── Base del bien (para comisión y depósito) ─────────────────────
  // VERIFICADO: la base es valorSinIVA + gpsFinanciado
  //   ($1,810,344.83 + $16,000) × 5%  = $91,317.24  ✓
  //   ($1,810,344.83 + $16,000) × 16% = $292,215.17 ✓
  const baseBien = valorSinIVA.plus(gpsFinanciado);

  // ── Comisión apertura ────────────────────────────────────────────
  const comisionMonto      = baseBien.times(inp.tasaComisionApertura);
  const comisionFinanciada = inp.comisionAperturaEsContado ? new Decimal(0) : comisionMonto;
  const comisionContado    = inp.comisionAperturaEsContado ? comisionMonto  : new Decimal(0);

  // ── Seguro ───────────────────────────────────────────────────────
  const seguroFinanciado = inp.seguroEsContado ? new Decimal(0) : new Decimal(inp.seguroMonto);
  const seguroContado    = inp.seguroEsContado ? new Decimal(inp.seguroMonto) : new Decimal(0);

  // ── Enganche ─────────────────────────────────────────────────────
  const engancheFinanciado = !inp.engancheEsContado ? new Decimal(inp.engancheMonto) : new Decimal(0);
  const engancheContado    =  inp.engancheEsContado ? new Decimal(inp.engancheMonto) : new Decimal(0);

  // ── Monto total DISPLAY (con IVA del bien) ───────────────────────
  // Lo que ve el cliente en la sección "Monto a financiar"
  const montoTotalDisplay = valorConIVA
    .plus(comisionFinanciada)
    .plus(seguroFinanciado)
    .plus(gpsFinanciado)
    .minus(engancheFinanciado);

  // ── Monto REAL financiado (SIN IVA del bien) → PMT ───────────────
  // VERIFICADO: PMT(3%, 48, 1,917,662.07, 292,215.17) = $73,098.02 ✓
  // VERIFICADO: PMT(3%, 48, 1,917,662.07, 0)          = $75,896.80 ✓
  const montoFinanciadoReal = baseBien.plus(comisionFinanciada);

  // ── Depósito en garantía ─────────────────────────────────────────
  const depositoGarantia = baseBien.times(inp.porcentajeResidual);

  // ── FV del PMT ───────────────────────────────────────────────────
  // PURO: residual real al final del plazo
  // FINANCIERO: 0 — amortiza todo el capital
  const fvPMT = inp.producto === 'PURO' ? depositoGarantia : new Decimal(0);

  // ── Renta mensual ────────────────────────────────────────────────
  const rentaNeta = calcPMT(
    inp.tasaAnual,
    inp.plazo,
    montoFinanciadoReal.toNumber(),
    fvPMT.toNumber(),
  );
  const rentaDecimal = new Decimal(rentaNeta);
  const rentaIVA     = rentaDecimal.times(IVA);

  // ── Residual DISPLAY para la sección 4 ───────────────────────────
  // % × monto total cotización (con IVA), solo display
  // PURO:       16% × $2,207,317.24 = $353,170.76 ✓
  // FINANCIERO:  2% × $2,207,317.24 = $44,146.34  ✓
  const residualDisplay = montoTotalDisplay.times(inp.porcentajeResidual);
  const residualIVA     = residualDisplay.times(IVA);
  const residualTotal   = residualDisplay.times(IVA.plus(1));

  // ── Pago inicial total ──────────────────────────────────────────
  const pagoInicialTotal = engancheContado
    .plus(comisionContado)
    .plus(seguroContado)
    .plus(depositoGarantia)
    .plus(gpsContado);

  // ── Fecha ────────────────────────────────────────────────────────
  const fechaStr = formatFechaDMY(inp.fecha);

  // ── Redondeo final ───────────────────────────────────────────────
  const r2 = (d: Decimal) => d.toDecimalPlaces(2, Decimal.ROUND_HALF_UP).toNumber();

  return {
    fecha:           fechaStr,
    nombreCliente:   inp.nombreCliente,
    valorBienConIVA: r2(valorConIVA),
    valorBienSinIVA: r2(valorSinIVA),
    nombreBien:      inp.nombreBien,
    estadoBien:      inp.estadoBien,
    seguroEstado:    inp.seguroEstado,
    producto:        inp.producto,
    plazo:           inp.plazo,

    monto: {
      valorBienSinIVA:            r2(valorSinIVA),
      valorBienConIVA:            r2(valorConIVA),
      comisionAperturaFinanciada: r2(comisionFinanciada),
      seguroFinanciado:           r2(seguroFinanciado),
      gpsFinanciado:              r2(gpsFinanciado),
      descuentoEnganche:          r2(engancheFinanciado),
      total:                      r2(montoTotalDisplay),
    },

    pagoInicial: {
      engancheContado:         r2(engancheContado),
      comisionAperturaContado: r2(comisionContado),
      aperturaSeguros:         r2(seguroContado),
      depositoGarantia:        r2(depositoGarantia),
      gpsContado:              r2(gpsContado),
      total:                   r2(pagoInicialTotal),
    },

    rentaMensual: {
      montoNeto: r2(rentaDecimal),
      iva:       r2(rentaIVA),
      total:     r2(rentaDecimal.times(IVA.plus(1))),
    },

    residual: {
      etiqueta:   inp.producto === 'PURO' ? 'Valor de rescate' : 'Opcion de compra',
      porcentaje: inp.porcentajeResidual,
      monto:      r2(residualDisplay),
      iva:        r2(residualIVA),
      total:      r2(residualTotal),
    },

    montoFinanciadoReal: r2(montoFinanciadoReal),
    fvAmortizacion:      r2(fvPMT),
  };
}

// ═══════════════════════════════════════════════════════════════════
// Helper exportado
// ═══════════════════════════════════════════════════════════════════

/** Formatea una fecha como "DD-MM-YYYY" */
export function formatFechaDMY(d: Date): string {
  return (
    String(d.getDate()).padStart(2, '0') +
    '-' +
    String(d.getMonth() + 1).padStart(2, '0') +
    '-' +
    d.getFullYear()
  );
}
