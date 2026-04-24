/**
 * Cálculo financiero de cotizaciones — Inyecta Arrendamiento
 * ---------------------------------------------------------------
 * Fuente de verdad: CLAUDE.md §4 (verificado contra el Excel de
 * Inyecta el 24-04-2026). Los nombres de variables citan las celdas
 * Excel donde aplica.
 *
 * Cambio importante (2026-04): baseBien (B17) ahora resta el enganche
 * antes de calcular comisión y depósito, espejo del Excel:
 *
 *   B17 = valorSinIVA - enganche + (gpsFinanciado ? gps : 0)
 *
 * La versión anterior NO restaba enganche, lo que inflaba comisión y
 * depósito en operaciones con enganche > 0.
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
// Helpers internos
// ═══════════════════════════════════════════════════════════════════

/**
 * Patrón dual %/monto absoluto (CLAUDE.md §4.15).
 *
 * Replica del Excel: `IF(H4<2, base*H4, H4)`. Usado en enganche (H4),
 * depósito (H8) y valor residual (H10).
 *
 * @param input  el valor capturado por el usuario (ej. 0.16  ó  77586.21)
 * @param base   la base sobre la que se aplica si input se interpreta como %
 *               (típicamente baseBien o valorSinIVA)
 * @returns      monto absoluto en MXN
 */
function resolverDual(input: number, base: Decimal): Decimal {
  const v = new Decimal(input);
  return v.lt(2) ? base.times(v) : v;
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

  // ── Depósito en garantía (CLAUDE.md §4.12) ───────────────────────
  /**
   * Patrón dual %/monto absoluto (§4.15):
   *   - <2  ⇒ porcentaje sobre baseBien (ej. 0.10 = 10%)
   *   - ≥2  ⇒ monto absoluto en MXN (ej. 77586.21)
   * PURO: queda como FV del PMT.
   * FIN : monto que el cliente entrega y se le reembolsa al final.
   */
  porcentajeDeposito: number;

  // ── Valor residual (CLAUDE.md §4.12) — solo PURO ─────────────────
  /**
   * Patrón dual %/monto absoluto (§4.15). Solo PURO. En FIN se ignora.
   * Si `valorResidualEsComision = true`, ESTE valor se ignora y se
   * usa la comisión de apertura como residual (§4.13).
   */
  valorResidual: number;

  /**
   * CLAUDE.md §4.13: solo PURO. Si true, valorResidual = comisión
   * apertura (ignorando el campo `valorResidual`). En FIN se ignora.
   */
  valorResidualEsComision?: boolean;

  // ── GPS ──────────────────────────────────────────────────────────
  gpsMonto: number;
  gpsEsContado: boolean;

  // ── Seguro (CLAUDE.md §4.14) ─────────────────────────────────────
  /** Monto ANUAL del seguro (no mensual ni total). */
  seguroAnual: number;
  /** Si true, no entra en cálculos hasta que se especifique (§4.14). */
  seguroPendiente?: boolean;
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
    depositoGarantia: number;  // resolverDual(porcentajeDeposito, baseBien) — §4.12
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

/**
 * Calcula una cotización completa de arrendamiento (PURO o FINANCIERO).
 *
 * Es la fuente de verdad de los números que se muestran al cliente y
 * se imprimen en el PDF (CotizacionPDF). Pasa cada operación por
 * Decimal.js (precision 20, ROUND_HALF_UP) para reproducir los
 * valores del Excel de Inyecta al centavo (CLAUDE.md §4 — verificado
 * contra `Cotización Inyecta Arrendamiento.xlsx` el 18-04-2026).
 *
 * Orden estricto de cálculo (CLAUDE.md §4.2, no alterar):
 *
 *   1. valorSinIVA  (E6)  = valorConIVA / (1 + IVA)
 *   2. baseBien     (B17) = valorSinIVA - enganche
 *                         + (gpsFinanciado    ? gps : 0)
 *                         + (seguroFinanciado ? seguroAnual × plazo/12 : 0)
 *      ← B17 resta enganche y suma seguro financiado prorrateado al
 *        plazo (§4.2 / §4.14).
 *   3. comisiónApertura (B18) = baseBien × tasaComisión
 *   4. depósitoGarantía (E18) = resolverDual(porcentajeDeposito, baseBien)
 *   5. montoFinanciadoReal (B19) = baseBien + comisiónFinanciada
 *      ← PV que entra al PMT; el IVA del bien NUNCA se financia.
 *   6. PMT con FV = depósito (PURO) o 0 (FINANCIERO).
 *   7. Sección "Monto a financiar" = display con IVA del bien
 *      (NO entra al PMT — solo se muestra al cliente).
 *   8. Residual display (§4.5):
 *      PURO:       valorResidualResuelto (E21) = comisiónApertura
 *                  si valorResidualEsComision, si no
 *                  resolverDual(valorResidual, baseBien).
 *      FINANCIERO: baseBien × 0.02 (precio simbólico, §4.5).
 *
 * Diferencias clave por producto (regla 5/8):
 *   - PURO       → FV PMT = depósito; sección 4 = "Valor de rescate" 16%.
 *   - FINANCIERO → FV PMT = 0;        sección 4 = "Opcion de compra" 2%.
 *
 * @param inp  parámetros del bien, financiamiento, GPS, seguro y cliente.
 * @returns    objeto con todas las secciones del PDF + campos técnicos
 *             (`montoFinanciadoReal`, `fvAmortizacion`) que `calcAmort*`
 *             requieren para reproducir la tabla de amortización
 *             coherente con la renta mostrada.
 */
export function calcularCotizacion(inp: InputsCotizacion): ResultadoCotizacion {
  const IVA = new Decimal(inp.tasaIVA);

  // ── Bien ─────────────────────────────────────────────────────────
  const valorConIVA = new Decimal(inp.valorBienConIVA);
  const valorSinIVA = valorConIVA.dividedBy(IVA.plus(1));

  // ── GPS ──────────────────────────────────────────────────────────
  const gpsFinanciado = inp.gpsEsContado ? new Decimal(0) : new Decimal(inp.gpsMonto);
  const gpsContado    = inp.gpsEsContado ? new Decimal(inp.gpsMonto) : new Decimal(0);

  // ── Enganche (siempre reduce baseBien per Excel B17) ─────────────
  // En el Excel B17 SIEMPRE resta el enganche (E17), independientemente
  // de si el cliente lo paga al contado o lo difiere. La distinción
  // contado/financiado es solo para presentación en la cotización.
  const engancheTotal      = new Decimal(inp.engancheMonto);
  const engancheFinanciado = !inp.engancheEsContado ? engancheTotal : new Decimal(0);
  const engancheContado    =  inp.engancheEsContado ? engancheTotal : new Decimal(0);

  // ── Seguro (CLAUDE.md §4.14) ─────────────────────────────────────
  // - seguroPendiente: 0 en B17 y 0 en pago inicial (no entra hasta
  //   que se especifique el monto).
  // - financiado:     suma seguroAnual × plazo/12 a B17 (total del
  //   seguro durante toda la vigencia del contrato).
  // - contado:        cliente paga seguroAnual al inicio (anualidad).
  const seguroAnualDec = inp.seguroPendiente
    ? new Decimal(0)
    : new Decimal(inp.seguroAnual);
  const plazoMeses = new Decimal(inp.plazo);
  const seguroFinanciadoTotal = !inp.seguroEsContado
    ? seguroAnualDec.times(plazoMeses).dividedBy(12)
    : new Decimal(0);
  const seguroContado = inp.seguroEsContado ? seguroAnualDec : new Decimal(0);

  // ── Base del bien (B17 — para comisión y depósito) ───────────────
  // CLAUDE.md §4.2:
  //   B17 = valorSinIVA - enganche
  //       + (gpsFinanciado    ? gps : 0)
  //       + (seguroFinanciado ? seguroAnual × plazo/12 : 0)
  const baseBien = valorSinIVA
    .minus(engancheTotal)
    .plus(gpsFinanciado)
    .plus(seguroFinanciadoTotal);

  // ── Comisión apertura (B18) ──────────────────────────────────────
  const comisionMonto      = baseBien.times(inp.tasaComisionApertura);
  const comisionFinanciada = inp.comisionAperturaEsContado ? new Decimal(0) : comisionMonto;
  const comisionContado    = inp.comisionAperturaEsContado ? comisionMonto  : new Decimal(0);

  // ── Monto total DISPLAY (con IVA del bien) ───────────────────────
  // Lo que ve el cliente en la sección "Monto a financiar". El seguro
  // financiado se muestra como total prorrateado al plazo (consistente
  // con lo que entra a B17).
  const montoTotalDisplay = valorConIVA
    .plus(comisionFinanciada)
    .plus(seguroFinanciadoTotal)
    .plus(gpsFinanciado)
    .minus(engancheFinanciado);

  // ── Monto REAL financiado / PV del PMT (B19) ─────────────────────
  // B19 = B17 + comisiónFinanciada (sin IVA del bien)
  const montoFinanciadoReal = baseBien.plus(comisionFinanciada);

  // ── Depósito en garantía (E18, dual %/monto §4.15) ──────────────
  const depositoGarantia = resolverDual(inp.porcentajeDeposito, baseBien);

  // ── Valor residual resuelto (E21, §4.12 + §4.13) ────────────────
  //   PURO  : si valorResidualEsComision ⇒ = comisión apertura,
  //           si no ⇒ resolverDual(valorResidual, baseBien).
  //   FIN   : baseBien × 0.02 (opción de compra simbólica, §4.5).
  const valorResidualResuelto =
    inp.producto === 'PURO'
      ? (inp.valorResidualEsComision
          ? comisionMonto
          : resolverDual(inp.valorResidual, baseBien))
      : baseBien.times(0.02);

  // ── FV del PMT ───────────────────────────────────────────────────
  // PURO: depósito real al final del plazo (queda como saldo final)
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

  // ── Residual DISPLAY para la sección 4 (CLAUDE.md §4.5) ──────────
  // PURO:       valorResidualResuelto (E21)
  // FINANCIERO: baseBien × 2% (precio simbólico de opción de compra)
  const residualDisplay = valorResidualResuelto;
  const residualIVA     = residualDisplay.times(IVA);
  const residualTotal   = residualDisplay.times(IVA.plus(1));

  // ── Porcentaje del residual (solo display) ───────────────────────
  // PURO con flag "= comisión": el % efectivo es la tasa de comisión.
  // PURO con valor dual: si <2 es %, si ≥2 calculamos el % implícito
  // sobre baseBien para mostrarlo coherente.
  // FINANCIERO: siempre 2%.
  let residualPorcentaje: number;
  if (inp.producto === 'PURO') {
    if (inp.valorResidualEsComision) {
      residualPorcentaje = inp.tasaComisionApertura;
    } else if (inp.valorResidual < 2) {
      residualPorcentaje = inp.valorResidual;
    } else if (baseBien.isZero()) {
      residualPorcentaje = 0;
    } else {
      residualPorcentaje = new Decimal(inp.valorResidual)
        .dividedBy(baseBien)
        .toDecimalPlaces(4, Decimal.ROUND_HALF_UP)
        .toNumber();
    }
  } else {
    residualPorcentaje = 0.02;
  }

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
    // CLAUDE.md §4.14: si el monto del seguro está pendiente, el PDF
    // debe mostrar "Pendiente de cotizar" sin importar lo que llegue
    // como seguroEstado.
    seguroEstado:    inp.seguroPendiente ? 'Pendiente de cotizar' : inp.seguroEstado,
    producto:        inp.producto,
    plazo:           inp.plazo,

    monto: {
      valorBienSinIVA:            r2(valorSinIVA),
      valorBienConIVA:            r2(valorConIVA),
      comisionAperturaFinanciada: r2(comisionFinanciada),
      seguroFinanciado:           r2(seguroFinanciadoTotal),
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
      porcentaje: residualPorcentaje,
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
