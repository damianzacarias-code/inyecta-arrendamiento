/**
 * Tablas de amortización — Inyecta Arrendamiento
 * ---------------------------------------------------------------
 * Dos variantes completamente distintas:
 *
 *   PURO:       solo renta + IVA (sin desglose de capital/saldo).
 *               IVA = renta × 16% (toda la renta es base gravable).
 *
 *   FINANCIERO: renta = capital + interés.  IVA = renta × 16%
 *               (CLAUDE.md §4.6/§4.8 + regla 8: IVA en tablas se
 *               calcula sobre la renta completa para AMBOS productos,
 *               según práctica operativa de Inyecta validada en su
 *               Excel de referencia).
 *
 * La última fila cierra con saldo = 0.00 usando capital = saldo
 * exacto (no Math.max). Todo pasa por Decimal.js.
 */
import Decimal from 'decimal.js';

Decimal.set({ precision: 20, rounding: Decimal.ROUND_HALF_UP });

// ═══════════════════════════════════════════════════════════════════
// Tipos
// ═══════════════════════════════════════════════════════════════════

export interface FilaAmortPuro {
  periodo: number;
  fecha:   string;   // "DD-MM-YYYY"
  renta:   number;
  iva:     number;
  total:   number;
}

export interface FilaAmortFinanciero {
  periodo: number;
  fecha:   string;
  capital: number;
  interes: number;
  iva:     number;   // IVA = renta × 16% (CLAUDE.md §4.6/§4.8 + regla 8)
  total:   number;   // capital + interés + IVA(renta)
  saldo:   number;
}

// ═══════════════════════════════════════════════════════════════════
// Arrendamiento PURO — tabla simple (sin capital / sin saldo)
// ═══════════════════════════════════════════════════════════════════

export function calcAmortPuro(
  rentaNeta: number,
  plazo: number,
  fechaPrimerPago: Date,
  tasaIVA = 0.16,
): FilaAmortPuro[] {
  const filas: FilaAmortPuro[] = [];
  const renta = new Decimal(rentaNeta);
  const iva   = renta.times(tasaIVA);
  const total = renta.plus(iva);

  for (let i = 1; i <= plazo; i++) {
    const fecha = addMeses(fechaPrimerPago, i - 1);
    filas.push({
      periodo: i,
      fecha:   formatFecha(fecha),
      renta:   r2(renta),
      iva:     r2(iva),
      total:   r2(total),
    });
  }
  return filas;
}

// ═══════════════════════════════════════════════════════════════════
// Arrendamiento FINANCIERO — tabla con capital / interés / saldo
// ═══════════════════════════════════════════════════════════════════

/**
 * Para FINANCIERO:
 *   montoFinanciadoReal = resultado.montoFinanciadoReal (SIN IVA del bien)
 *   fvAmortizacion      = 0   (amortiza todo el capital)
 *
 * La función también acepta parámetros de PURO desglosados, pero el
 * Cotizador actual usa `calcAmortPuro` para la tabla visual de Puro.
 * Esta función se mantiene genérica por si algún reporte interno
 * quisiera desglose capital/interés para Puro también.
 */
export function calcAmortFinanciero(
  montoFinanciadoReal: number,
  tasaAnual: number,
  plazo: number,
  fvAmortizacion: number,
  fechaPrimerPago: Date,
  tasaIVA = 0.16,
): FilaAmortFinanciero[] {
  const r  = new Decimal(tasaAnual).dividedBy(12);
  const P  = new Decimal(montoFinanciadoReal);
  const FV = new Decimal(fvAmortizacion);

  // PMT = (P·r·(1+r)^n − FV·r) / ((1+r)^n − 1)
  const factor = r.plus(1).pow(plazo);
  const PMT = P.times(r).times(factor).minus(FV.times(r)).dividedBy(factor.minus(1));

  const filas: FilaAmortFinanciero[] = [];
  let saldo = P;

  // IVA = renta × 16% para AMBOS productos (CLAUDE.md §4.6/§4.8 + regla 8).
  // Aunque el Art 18-A LIVA permite gravar solo el interés, la práctica
  // operativa de Inyecta —fuente de verdad del Excel— grava la renta total.
  const ivaConst = PMT.times(tasaIVA);

  for (let i = 1; i <= plazo; i++) {
    const esUltima = i === plazo;
    const interes  = saldo.times(r);
    // Última fila: capital = (saldo − FV) exacto → cierra en FV sin residuo
    const capital    = esUltima ? saldo.minus(FV) : PMT.minus(interes);
    const nuevoSaldo = esUltima ? FV              : saldo.minus(capital);
    const iva        = ivaConst;
    const total      = capital.plus(interes).plus(iva);

    const fecha = addMeses(fechaPrimerPago, i - 1);
    filas.push({
      periodo: i,
      fecha:   formatFecha(fecha),
      capital: r2(capital),
      interes: r2(interes),
      iva:     r2(iva),
      total:   r2(total),
      saldo:   r2(nuevoSaldo),
    });

    saldo = nuevoSaldo;
  }
  return filas;
}

// ═══════════════════════════════════════════════════════════════════
// Helpers
// ═══════════════════════════════════════════════════════════════════

/**
 * Suma `meses` a una fecha, evitando el efecto de fin-de-mes (ej: 31-ene + 1
 * mes → 28-feb en vez de 03-mar). La hora se fija a 12:00 para evitar
 * artefactos de DST.
 */
function addMeses(base: Date, meses: number): Date {
  const totalMeses = base.getMonth() + meses;
  const yr  = base.getFullYear() + Math.floor(totalMeses / 12);
  const mo  = ((totalMeses % 12) + 12) % 12;
  const dia = base.getDate();
  const maxDia = new Date(yr, mo + 1, 0).getDate();
  return new Date(yr, mo, Math.min(dia, maxDia), 12, 0, 0);
}

function formatFecha(d: Date): string {
  return (
    String(d.getDate()).padStart(2, '0') +
    '-' +
    String(d.getMonth() + 1).padStart(2, '0') +
    '-' +
    d.getFullYear()
  );
}

function r2(d: Decimal): number {
  return d.toDecimalPlaces(2, Decimal.ROUND_HALF_UP).toNumber();
}
