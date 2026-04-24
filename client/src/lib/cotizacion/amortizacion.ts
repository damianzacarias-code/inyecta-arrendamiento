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

/**
 * Genera la tabla de amortización para Arrendamiento PURO.
 *
 * En PURO la renta es CONSTANTE durante todo el plazo (no hay
 * desglose capital/interés ni saldo amortizable — el bien NO se
 * transfiere al cliente, solo se renta). El IVA se calcula sobre la
 * renta completa (CLAUDE.md regla 8).
 *
 * @param rentaNeta        renta mensual sin IVA (tomada del PMT con
 *                          FV = depósito en garantía).
 * @param plazo            número de períodos mensuales (12..48).
 * @param fechaPrimerPago  fecha del 1° pago; los siguientes se
 *                          generan con `addMeses` (evita el bug de
 *                          fin-de-mes de Date.setMonth).
 * @param tasaIVA          tasa de IVA decimal, default 0.16 (16%).
 * @returns                array de filas con renta/IVA/total constantes.
 */
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
 * Genera la tabla de amortización para Arrendamiento FINANCIERO
 * (o cualquier producto con desglose capital/interés/saldo).
 *
 * Reglas críticas verificadas contra el Excel de Inyecta:
 *
 *   - PMT constante = (P·r·(1+r)^n − FV·r) / ((1+r)^n − 1)
 *   - Última fila: capital = (saldo − FV) EXACTO. No se usa
 *     `PMT − interés` para que el saldo final cierre exacto en FV
 *     sin residuo de redondeo (CLAUDE.md regla 6).
 *   - IVA = renta × 16% en TODAS las filas, no `interés × 16%`
 *     (CLAUDE.md regla 8 + §4.6/§4.8). Aunque el Art 18-A LIVA
 *     permite gravar solo el interés, la práctica operativa de
 *     Inyecta —fuente de verdad del Excel— grava la renta total.
 *
 * Uso típico:
 *
 *   FINANCIERO → fvAmortizacion = 0
 *                montoFinanciadoReal = baseBien + comisiónFinanciada
 *
 *   PURO       → ver `calcAmortPuro` (no usa esta función). Aunque
 *                acepta parámetros desglosados también para Puro, el
 *                Cotizador no la usa así; queda genérica por si algún
 *                reporte interno requiere desglose capital/interés.
 *
 * @param montoFinanciadoReal  PV (sin IVA del bien).
 * @param tasaAnual            tasa anual decimal (ej: 0.36 = 36%).
 * @param plazo                número de períodos mensuales (12..48).
 * @param fvAmortizacion       FV objetivo al final del plazo.
 * @param fechaPrimerPago      fecha del 1° pago (resto vía `addMeses`).
 * @param tasaIVA              tasa de IVA decimal, default 0.16.
 * @returns                    tabla con saldo final == fvAmortizacion exacto.
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

// ═══════════════════════════════════════════════════════════════════
// T8 — Pagos adicionales
// ═══════════════════════════════════════════════════════════════════

/**
 * PURO → "Rentas Prorrateadas"
 * ----------------------------------------------------------------
 * El cliente entrega un pago adicional NETO (sin IVA) en el período
 * `periodo`. NO reduce capital (no hay capital en PURO), solo se
 * redistribuye en las rentas restantes.
 *
 * Fórmula CLAUDE.md §4.10:
 *   nueva_renta_neta =
 *     ( (plazo - periodo) × renta_neta_actual − pago_adicional_neto )
 *     / (plazo - periodo)
 *
 * @returns una nueva tabla PURO completa: las primeras `periodo` filas
 *          conservan la renta original; las restantes usan la nueva renta.
 */
export function aplicarPagoAdicionalPuro(
  filasOriginales: FilaAmortPuro[],
  periodo: number,
  pagoAdicionalNeto: number,
  tasaIVA = 0.16,
): FilaAmortPuro[] {
  if (periodo < 1 || periodo >= filasOriginales.length) {
    throw new Error(`Período ${periodo} fuera de rango [1..${filasOriginales.length - 1}]`);
  }
  const restantes = filasOriginales.length - periodo;
  const rentaActual = new Decimal(filasOriginales[periodo - 1].renta);
  const adicional   = new Decimal(pagoAdicionalNeto);

  // Total neto que faltaba pagar después del período N (sin contar el N mismo)
  const totalNetoRestante = rentaActual.times(restantes);
  const nuevoTotalNeto    = totalNetoRestante.minus(adicional);
  if (nuevoTotalNeto.isNegative()) {
    throw new Error(
      `Pago adicional ($${pagoAdicionalNeto}) excede el saldo neto restante ($${totalNetoRestante})`,
    );
  }
  const nuevaRenta = nuevoTotalNeto.dividedBy(restantes);
  const nuevaIVA   = nuevaRenta.times(tasaIVA);
  const nuevoTotal = nuevaRenta.plus(nuevaIVA);

  return filasOriginales.map((f, idx) => {
    if (idx < periodo) return f;
    return {
      ...f,
      renta: r2(nuevaRenta),
      iva:   r2(nuevaIVA),
      total: r2(nuevoTotal),
    };
  });
}

/**
 * FINANCIERO → "Rentas Anticipadas"
 * ----------------------------------------------------------------
 * El cliente abona un pago adicional al capital en el período `periodo`.
 * El saldo se reduce y se recalcula el PMT para los períodos restantes
 * conservando la misma tasa.
 *
 * Fórmula CLAUDE.md §4.10:
 *   saldo_tras_abono = saldo_al_final_del_periodo − pago_adicional
 *   nueva_renta = PMT(tasa/12, periodos_restantes, saldo_tras_abono, fv)
 *
 * @param filasOriginales   tabla generada por calcAmortFinanciero
 * @param periodo           período en el que se hace el abono (1..plazo-1)
 * @param pagoAdicional     monto del abono extra a capital
 * @param tasaAnual         misma tasa que se usó en el PMT original
 * @param fvFinal           FV objetivo al final (usual: 0 en FIN)
 * @param tasaIVA           default 0.16
 * @returns nueva tabla con las filas a partir de `periodo+1` recalculadas.
 */
export function aplicarPagoAdicionalFinanciero(
  filasOriginales: FilaAmortFinanciero[],
  periodo: number,
  pagoAdicional: number,
  tasaAnual: number,
  fvFinal = 0,
  tasaIVA = 0.16,
): FilaAmortFinanciero[] {
  if (periodo < 1 || periodo >= filasOriginales.length) {
    throw new Error(`Período ${periodo} fuera de rango [1..${filasOriginales.length - 1}]`);
  }
  const r        = new Decimal(tasaAnual).dividedBy(12);
  const FV       = new Decimal(fvFinal);
  const restantes = filasOriginales.length - periodo;

  // Saldo al cierre del período donde ocurre el abono
  const saldoOriginal  = new Decimal(filasOriginales[periodo - 1].saldo);
  const abono          = new Decimal(pagoAdicional);
  const saldoTrasAbono = saldoOriginal.minus(abono);
  if (saldoTrasAbono.lt(FV)) {
    throw new Error(
      `Pago adicional ($${pagoAdicional}) excede el saldo amortizable (saldo $${saldoOriginal} − fv $${fvFinal})`,
    );
  }

  // Nuevo PMT con saldo reducido y plazo remanente
  const factor = r.plus(1).pow(restantes);
  const nuevoPMT = saldoTrasAbono
    .times(r)
    .times(factor)
    .minus(FV.times(r))
    .dividedBy(factor.minus(1));

  // IVA constante = nuevo PMT × tasaIVA (CLAUDE.md regla 8)
  const ivaConst = nuevoPMT.times(tasaIVA);

  // Reconstruimos las filas a partir de `periodo+1`
  const nuevas: FilaAmortFinanciero[] = filasOriginales.slice(0, periodo);
  let saldo = saldoTrasAbono;
  for (let i = periodo + 1; i <= filasOriginales.length; i++) {
    const esUltima  = i === filasOriginales.length;
    const interes   = saldo.times(r);
    const capital   = esUltima ? saldo.minus(FV) : nuevoPMT.minus(interes);
    const nuevoSaldo = esUltima ? FV              : saldo.minus(capital);
    const total     = capital.plus(interes).plus(ivaConst);

    // Conservamos la fecha original (no cambia el calendario, solo los montos)
    nuevas.push({
      periodo: i,
      fecha:   filasOriginales[i - 1].fecha,
      capital: r2(capital),
      interes: r2(interes),
      iva:     r2(ivaConst),
      total:   r2(total),
      saldo:   r2(nuevoSaldo),
    });
    saldo = nuevoSaldo;
  }
  return nuevas;
}
