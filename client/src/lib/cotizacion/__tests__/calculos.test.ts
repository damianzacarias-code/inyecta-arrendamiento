/**
 * Tests del core financiero — verifica al centavo contra CLAUDE.md §4.
 *
 * Caso de referencia (Excel original de Inyecta):
 *   valorBienConIVA = $2,100,000
 *   tasaIVA         = 0.16
 *   tasaAnual       = 0.36 (3% mensual)
 *   plazo           = 48 meses
 *   gpsFinanciado   = $16,000
 *   comisión apert. = 5% baseBien (financiada)
 *   sin enganche, sin seguro
 *
 * Resultados esperados:
 *   PURO       renta = $73,098.02   depósito = $292,215.17
 *   FINANCIERO renta = $75,896.80   monto fin = $1,917,662.07
 */
import { describe, it, expect } from 'vitest';
import { calcPMT, calcularCotizacion } from '../calculos';
import {
  calcAmortPuro,
  calcAmortFinanciero,
  aplicarPagoAdicionalPuro,
  aplicarPagoAdicionalFinanciero,
} from '../amortizacion';

const baseInputs = {
  valorBienConIVA: 2_100_000,
  tasaIVA: 0.16,
  plazo: 48,
  tasaAnual: 0.36,
  tasaComisionApertura: 0.05,
  comisionAperturaEsContado: false,
  // CLAUDE.md §4.12: depósito y residual son conceptos separados.
  // En el caso baseline se usan los mismos 16% para que el saldo final
  // del PMT coincida con el residual (cliente "compensa" el depósito).
  porcentajeDeposito: 0.16,
  valorResidual: 0.16,
  valorResidualEsComision: false,
  gpsMonto: 16_000,
  gpsEsContado: false,
  seguroAnual: 0,
  seguroPendiente: false,
  seguroEsContado: true,
  engancheMonto: 0,
  engancheEsContado: true,
  nombreBien: 'Test',
  estadoBien: 'Nuevo',
  seguroEstado: 'Pendiente',
  nombreCliente: 'Test',
  fecha: new Date(2026, 3, 18),
} as const;

// ═══════════════════════════════════════════════════════════════════
// PMT — fórmula básica
// ═══════════════════════════════════════════════════════════════════

describe('calcPMT', () => {
  it('PURO: PMT(36%, 48, 1,917,662.07, 292,215.17) = 73,098.02', () => {
    expect(calcPMT(0.36, 48, 1_917_662.07, 292_215.17)).toBeCloseTo(73_098.02, 2);
  });

  it('FINANCIERO: PMT(36%, 48, 1,917,662.07, 0) = 75,896.80', () => {
    expect(calcPMT(0.36, 48, 1_917_662.07, 0)).toBeCloseTo(75_896.80, 2);
  });

  it('tasa 0% degenera a (PV-FV)/n', () => {
    expect(calcPMT(0, 12, 1200, 0)).toBe(100);
    expect(calcPMT(0, 10, 1000, 200)).toBe(80);
  });
});

// ═══════════════════════════════════════════════════════════════════
// calcularCotizacion — caso PURO de referencia
// ═══════════════════════════════════════════════════════════════════

describe('calcularCotizacion PURO (caso §4)', () => {
  const cot = calcularCotizacion({ ...baseInputs, producto: 'PURO' });

  it('valor sin IVA = $1,810,344.83', () => {
    expect(cot.valorBienSinIVA).toBeCloseTo(1_810_344.83, 2);
  });

  it('depósito en garantía = $292,215.17 (baseBien × 16%)', () => {
    expect(cot.pagoInicial.depositoGarantia).toBeCloseTo(292_215.17, 2);
  });

  it('monto financiado real (PV del PMT) = $1,917,662.07', () => {
    expect(cot.montoFinanciadoReal).toBeCloseTo(1_917_662.07, 2);
  });

  it('renta neta = $73,098.02', () => {
    expect(cot.rentaMensual.montoNeto).toBeCloseTo(73_098.02, 2);
  });

  it('IVA renta = $11,695.68 (renta × 16%)', () => {
    expect(cot.rentaMensual.iva).toBeCloseTo(11_695.68, 2);
  });

  it('valor de rescate display = $292,215.17 (E21 = baseBien × 16%, §4.5)', () => {
    // CLAUDE.md §4.5 PURO: el rescate display es valorResidualResuelto
    // (E21), NO un porcentaje sobre montoTotalDisplay (que era el bug
    // de la versión anterior). Con valorResidual=16% y baseBien =
    // $1,826,344.83, rescate = $292,215.17.
    expect(cot.residual.monto).toBeCloseTo(292_215.17, 2);
  });

  it('etiqueta de residual = "Valor de rescate"', () => {
    expect(cot.residual.etiqueta).toBe('Valor de rescate');
  });
});

// ═══════════════════════════════════════════════════════════════════
// calcularCotizacion — caso FINANCIERO de referencia
// ═══════════════════════════════════════════════════════════════════

describe('calcularCotizacion FINANCIERO (caso §4)', () => {
  const cot = calcularCotizacion({
    ...baseInputs,
    producto: 'FINANCIERO',
    // FIN: depósito separado del residual; el residual lo fija el motor
    // en 2% del baseBien (precio simbólico §4.5). El depósito puede
    // ser cualquier monto que el cliente entregue al inicio (queda como
    // saldo y se le reembolsa al final, NO entra al PMT).
    porcentajeDeposito: 0,
    valorResidual: 0,
  });

  it('monto financiado real = $1,917,662.07 (mismo que PURO)', () => {
    expect(cot.montoFinanciadoReal).toBeCloseTo(1_917_662.07, 2);
  });

  it('FV del PMT = 0 (FINANCIERO amortiza todo el capital)', () => {
    expect(cot.fvAmortizacion).toBe(0);
  });

  it('renta neta = $75,896.80', () => {
    expect(cot.rentaMensual.montoNeto).toBeCloseTo(75_896.80, 2);
  });

  it('IVA renta = $12,143.49 (renta × 16%, NO sobre interés)', () => {
    // CLAUDE.md regla 8: en tablas de Inyecta se grava la renta total
    expect(cot.rentaMensual.iva).toBeCloseTo(12_143.49, 2);
  });

  it('opción de compra display = $36,526.90 (2% sobre baseBien, §4.5)', () => {
    // CLAUDE.md §4.5 FIN: opción de compra = baseBien × 0.02 (precio
    // simbólico). baseBien = $1,826,344.83 → opción = $36,526.90.
    expect(cot.residual.monto).toBeCloseTo(36_526.90, 2);
  });

  it('etiqueta de residual = "Opcion de compra"', () => {
    expect(cot.residual.etiqueta).toBe('Opcion de compra');
  });
});

// ═══════════════════════════════════════════════════════════════════
// Amortización PURO al cliente — solo renta + IVA
// ═══════════════════════════════════════════════════════════════════

describe('calcAmortPuro', () => {
  const filas = calcAmortPuro(73_098.02, 48, new Date(2026, 0, 15));

  it('genera exactamente `plazo` filas', () => {
    expect(filas).toHaveLength(48);
  });

  it('todas las rentas son iguales (sin desglose)', () => {
    for (const f of filas) {
      expect(f.renta).toBeCloseTo(73_098.02, 2);
      expect(f.iva).toBeCloseTo(11_695.68, 2);
      expect(f.total).toBeCloseTo(84_793.70, 2);
    }
  });

  it('fechas avanzan 1 mes preservando día (sin bug fin-de-mes)', () => {
    const enero = calcAmortPuro(1000, 3, new Date(2026, 0, 31));
    expect(enero[0].fecha).toBe('31-01-2026');
    expect(enero[1].fecha).toBe('28-02-2026'); // febrero corto
    expect(enero[2].fecha).toBe('31-03-2026');
  });
});

// ═══════════════════════════════════════════════════════════════════
// Amortización FINANCIERO — desglose con cierre exacto
// ═══════════════════════════════════════════════════════════════════

describe('calcAmortFinanciero (caso §4.8 — FV = depósito, replica PURO desglose)', () => {
  const filas = calcAmortFinanciero(
    1_917_662.07,
    0.36,
    48,
    292_215.17,                         // FV = depósito → §4.8 textual
    new Date(2026, 0, 15),
  );

  it('p1 interés = $57,529.86 (saldo inicial × 3%)', () => {
    expect(filas[0].interes).toBeCloseTo(57_529.86, 2);
  });

  it('p1 capital = $15,568.16 (PMT − interés)', () => {
    expect(filas[0].capital).toBeCloseTo(15_568.16, 2);
  });

  it('p1 IVA = $11,695.68 (PMT $73,098.02 × 16%, NO sobre interés)', () => {
    expect(filas[0].iva).toBeCloseTo(11_695.68, 2);
  });

  it('p1 saldo = $1,902,093.91', () => {
    expect(filas[0].saldo).toBeCloseTo(1_902_093.91, 2);
  });

  it('p48 saldo = $292,215.17 (cierre exacto en FV)', () => {
    expect(filas[47].saldo).toBeCloseTo(292_215.17, 2);
  });
});

describe('calcAmortFinanciero (caso real FINANCIERO — FV = 0)', () => {
  const filas = calcAmortFinanciero(
    1_917_662.07,
    0.36,
    48,
    0,
    new Date(2026, 0, 15),
  );

  it('p48 saldo = $0.00 EXACTO (sin residuo de redondeo)', () => {
    expect(filas[47].saldo).toBe(0);
  });

  it('IVA constante = renta × 16% en todas las filas', () => {
    const iva0 = filas[0].iva;
    expect(iva0).toBeCloseTo(75_896.80 * 0.16, 2);
    for (const f of filas) {
      expect(f.iva).toBeCloseTo(iva0, 2);
    }
  });

  it('capital crece y interés decrece (curva francesa)', () => {
    expect(filas[0].capital).toBeLessThan(filas[47].capital);
    expect(filas[0].interes).toBeGreaterThan(filas[47].interes);
  });

  it('suma de capitales ≈ monto financiado original (tolerancia plazo×$0.01)', () => {
    // Cada capital se redondea a 2 decimales antes de sumarse, lo que puede
    // dejar un residuo acumulado de hasta ±plazo·$0.01.
    const totalCap = filas.reduce((acc, f) => acc + f.capital, 0);
    const diff = Math.abs(totalCap - 1_917_662.07);
    expect(diff).toBeLessThanOrEqual(0.05);  // 48 × $0.01 / 2 ≈ tolerancia razonable
  });
});

// ═══════════════════════════════════════════════════════════════════
// T8 — Pagos adicionales
// ═══════════════════════════════════════════════════════════════════

describe('aplicarPagoAdicionalPuro (Rentas Prorrateadas)', () => {
  // 12 períodos, renta neta $10,000 → restantes (post-período) ahorran $X
  const original = calcAmortPuro(10_000, 12, new Date(2026, 0, 15));

  it('mantiene intactas las primeras `periodo` filas', () => {
    const out = aplicarPagoAdicionalPuro(original, 3, 6_000);
    for (let i = 0; i < 3; i++) {
      expect(out[i].renta).toBe(original[i].renta);
      expect(out[i].iva).toBe(original[i].iva);
    }
  });

  it('redistribuye el pago en las rentas restantes', () => {
    // Con pago adicional $9,000 en período 3:
    //   restantes = 12 - 3 = 9
    //   total neto restante = 9 × $10,000 = $90,000
    //   nuevo total neto = $90,000 - $9,000 = $81,000
    //   nueva renta = $81,000 / 9 = $9,000.00
    const out = aplicarPagoAdicionalPuro(original, 3, 9_000);
    for (let i = 3; i < 12; i++) {
      expect(out[i].renta).toBeCloseTo(9_000, 2);
      expect(out[i].iva).toBeCloseTo(1_440, 2);   // 9,000 × 16%
      expect(out[i].total).toBeCloseTo(10_440, 2);
    }
  });

  it('rechaza pagos que excedan el saldo neto restante', () => {
    expect(() => aplicarPagoAdicionalPuro(original, 3, 100_000)).toThrow(/excede/);
  });

  it('rechaza períodos fuera de rango', () => {
    expect(() => aplicarPagoAdicionalPuro(original, 0, 1000)).toThrow(/fuera de rango/);
    expect(() => aplicarPagoAdicionalPuro(original, 12, 1000)).toThrow(/fuera de rango/);
  });
});

// ═══════════════════════════════════════════════════════════════════
// Casos extendidos del Excel — banderas nuevas (§4.13, §4.14, §4.15)
// Verifican al centavo que el motor procesa correctamente los nuevos
// inputs introducidos en commits 2-5 (residual=comisión, seguro
// pendiente, dual %/monto, B17 con enganche descontado).
// ═══════════════════════════════════════════════════════════════════

describe('calcularCotizacion PURO — enganche > 0 (§4.2 B17)', () => {
  // engancheMonto absoluto = $200,000 sobre valorSinIVA = $1,810,344.83.
  // baseBien (B17) = 1,810,344.83 − 200,000 + 16,000 = 1,626,344.83.
  // El enganche se resta de B17 SIEMPRE (independiente de contado/financiado),
  // espejo del Excel. La comisión y el depósito heredan el descuento.
  const cot = calcularCotizacion({
    ...baseInputs,
    producto: 'PURO',
    engancheMonto: 200_000,
    engancheEsContado: true,
  });

  it('comisión apertura = baseBien × 5% = $81,317.24', () => {
    expect(cot.monto.comisionAperturaFinanciada).toBeCloseTo(81_317.24, 2);
  });

  it('depósito = baseBien × 16% = $260,215.17 (refleja enganche restado de B17)', () => {
    expect(cot.pagoInicial.depositoGarantia).toBeCloseTo(260_215.17, 2);
  });

  it('monto financiado real = baseBien + comisión = $1,707,662.07', () => {
    expect(cot.montoFinanciadoReal).toBeCloseTo(1_707_662.07, 2);
  });

  it('renta = PMT(36%, 48, 1,707,662.07, 260,215.17) — coherente con calcPMT', () => {
    // No hardcodeo el número: derivo el esperado del calcPMT que ya está
    // verificado contra el Excel. Si la renta del cotizador difiere, hay
    // un drift entre el motor y la fórmula PMT canónica.
    const esperada = calcPMT(0.36, 48, 1_707_662.07, 260_215.17);
    expect(cot.rentaMensual.montoNeto).toBeCloseTo(esperada, 2);
  });

  it('enganche al contado va al pago inicial, NO a "descuentoEnganche"', () => {
    expect(cot.pagoInicial.engancheContado).toBe(200_000);
    expect(cot.monto.descuentoEnganche).toBe(0);
  });
});

describe('calcularCotizacion PURO — valorResidual como MONTO ABSOLUTO (§4.15)', () => {
  // CLAUDE.md §4.15: input < 2 ⇒ porcentaje, input ≥ 2 ⇒ monto absoluto.
  // $100,000 está muy por encima de 2 → se interpreta como pesos.
  const cot = calcularCotizacion({
    ...baseInputs,
    producto: 'PURO',
    valorResidual: 100_000,
  });

  it('residual.monto = $100,000.00 EXACTO (no se multiplica por baseBien)', () => {
    expect(cot.residual.monto).toBe(100_000);
  });

  it('depósito sigue siendo $292,215.17 (16% × baseBien, independiente del residual)', () => {
    // §4.12: depósito y residual son conceptos separados — modificar uno
    // no debe arrastrar al otro.
    expect(cot.pagoInicial.depositoGarantia).toBeCloseTo(292_215.17, 2);
  });

  it('comisión apertura sigue siendo $91,317.24 (no la afecta el residual)', () => {
    expect(cot.monto.comisionAperturaFinanciada).toBeCloseTo(91_317.24, 2);
  });
});

describe('calcularCotizacion PURO — valorResidualEsComision (§4.13)', () => {
  // Checkbox UI: residual = comisión de apertura. El campo `valorResidual`
  // capturado se ignora completamente cuando la flag está activa.
  const cot = calcularCotizacion({
    ...baseInputs,
    producto: 'PURO',
    valorResidual: 0.16,                  // ignorado por la flag
    valorResidualEsComision: true,
  });

  it('residual.monto = comisión apertura, no 16% del baseBien', () => {
    expect(cot.residual.monto).toBeCloseTo(91_317.24, 2);
    expect(cot.monto.comisionAperturaFinanciada).toBeCloseTo(91_317.24, 2);
    expect(cot.residual.monto).toBe(cot.monto.comisionAperturaFinanciada);
  });

  it('residual.porcentaje = tasaComisionApertura (5%) cuando aplica la flag', () => {
    // Display: el porcentaje del residual es la tasa de comisión.
    expect(cot.residual.porcentaje).toBe(0.05);
  });

  it('depósito sigue 16% × baseBien = $292,215.17 (la flag no lo toca)', () => {
    expect(cot.pagoInicial.depositoGarantia).toBeCloseTo(292_215.17, 2);
  });
});

describe('calcularCotizacion — seguroPendiente (§4.14)', () => {
  // Si el seguro está pendiente de cotizar, NO debe entrar en B17 ni en
  // la renta (espejo de las celdas E12/B13 del Excel cuando el cliente
  // aún no especifica monto). El display debe decir "Pendiente de cotizar".
  const cot = calcularCotizacion({
    ...baseInputs,
    producto: 'PURO',
    seguroAnual: 50_000,            // se captura
    seguroPendiente: true,           // pero está pendiente → se ignora
    seguroEsContado: false,          // aun "financiado", el flag pendiente lo anula
  });

  it('depósito = $292,215.17 (mismo que baseline sin seguro)', () => {
    expect(cot.pagoInicial.depositoGarantia).toBeCloseTo(292_215.17, 2);
  });

  it('renta neta = $73,098.02 (baseline — seguro pendiente no afecta PMT)', () => {
    expect(cot.rentaMensual.montoNeto).toBeCloseTo(73_098.02, 2);
  });

  it('seguroEstado se sobrescribe a "Pendiente de cotizar"', () => {
    expect(cot.seguroEstado).toBe('Pendiente de cotizar');
  });

  it('monto.seguroFinanciado = 0 (no aparece en sección "Monto a financiar")', () => {
    expect(cot.monto.seguroFinanciado).toBe(0);
  });

  it('aperturaSeguros del pago inicial = 0 (tampoco se cobra al inicio)', () => {
    expect(cot.pagoInicial.aperturaSeguros).toBe(0);
  });
});

describe('calcularCotizacion PURO — seguro financiado con monto > 0 (§4.14)', () => {
  // seguroAnual = $50,000, plazo 48m ⇒ total prorrateado al plazo:
  //   seguroFinanciadoTotal = 50,000 × 48/12 = $200,000
  // baseBien (B17) = 1,810,344.83 + 16,000 + 200,000 = 2,026,344.83
  const cot = calcularCotizacion({
    ...baseInputs,
    producto: 'PURO',
    seguroAnual: 50_000,
    seguroPendiente: false,
    seguroEsContado: false,           // financiado → entra en B17
  });

  it('seguroFinanciado del display = anual × plazo/12 = $200,000', () => {
    expect(cot.monto.seguroFinanciado).toBe(200_000);
  });

  it('depósito = baseBien × 16% = $324,215.17 (B17 con seguro)', () => {
    expect(cot.pagoInicial.depositoGarantia).toBeCloseTo(324_215.17, 2);
  });

  it('comisión apertura = baseBien × 5% = $101,317.24', () => {
    expect(cot.monto.comisionAperturaFinanciada).toBeCloseTo(101_317.24, 2);
  });

  it('monto financiado real = baseBien + comisión = $2,127,662.07', () => {
    expect(cot.montoFinanciadoReal).toBeCloseTo(2_127_662.07, 2);
  });

  it('renta = PMT(36%, 48, 2,127,662.07, 324,215.17) — la mensualidad sube respecto al baseline', () => {
    const esperada = calcPMT(0.36, 48, 2_127_662.07, 324_215.17);
    expect(cot.rentaMensual.montoNeto).toBeCloseTo(esperada, 2);
    // Sanity: con seguro financiado la renta es mayor que la baseline.
    expect(cot.rentaMensual.montoNeto).toBeGreaterThan(73_098.02);
  });
});

describe('calcularCotizacion FINANCIERO — residual fijo 2% (§4.5)', () => {
  // En FINANCIERO el residual es opción de compra simbólica = 2% × baseBien
  // independientemente de lo que se capture en `valorResidual`.
  const cot = calcularCotizacion({
    ...baseInputs,
    producto: 'FINANCIERO',
    porcentajeDeposito: 0,
    valorResidual: 0.50,                   // ignorado en FIN
    valorResidualEsComision: true,         // ignorado en FIN
  });

  it('residual.monto = baseBien × 2% = $36,526.90 (ignora capturas y flags)', () => {
    expect(cot.residual.monto).toBeCloseTo(36_526.90, 2);
  });

  it('residual.porcentaje = 0.02 fijo', () => {
    expect(cot.residual.porcentaje).toBe(0.02);
  });

  it('etiqueta = "Opcion de compra"', () => {
    expect(cot.residual.etiqueta).toBe('Opcion de compra');
  });
});

describe('aplicarPagoAdicionalFinanciero (Rentas Anticipadas)', () => {
  // Caso de referencia: monto $1,917,662.07, 36% anual, 48 meses, FV=0
  const original = calcAmortFinanciero(
    1_917_662.07, 0.36, 48, 0, new Date(2026, 0, 15),
  );

  it('mantiene intactas las primeras `periodo` filas', () => {
    const out = aplicarPagoAdicionalFinanciero(original, 6, 50_000, 0.36, 0);
    for (let i = 0; i < 6; i++) {
      expect(out[i]).toEqual(original[i]);
    }
  });

  it('reduce el saldo y recalcula el PMT', () => {
    // Abono de $100,000 al final del período 12
    const out = aplicarPagoAdicionalFinanciero(original, 12, 100_000, 0.36, 0);
    // El nuevo PMT debe ser MENOR que el original (mismo plazo restante,
    // saldo reducido)
    const pmtOriginal = original[20].capital + original[20].interes; // capital+interes = renta
    const pmtNuevo    = out[20].capital + out[20].interes;
    expect(pmtNuevo).toBeLessThan(pmtOriginal);
  });

  it('saldo final = 0 exacto tras pago adicional', () => {
    const out = aplicarPagoAdicionalFinanciero(original, 12, 100_000, 0.36, 0);
    expect(out[47].saldo).toBe(0);
  });

  it('rechaza pagos que excedan el saldo amortizable', () => {
    // El saldo en p1 es ~$1,899,295. Un abono de $5M no es válido.
    expect(() =>
      aplicarPagoAdicionalFinanciero(original, 1, 5_000_000, 0.36, 0),
    ).toThrow(/excede/);
  });

  it('rechaza períodos fuera de rango', () => {
    expect(() => aplicarPagoAdicionalFinanciero(original, 0, 1000, 0.36, 0)).toThrow(/fuera de rango/);
    expect(() => aplicarPagoAdicionalFinanciero(original, 48, 1000, 0.36, 0)).toThrow(/fuera de rango/);
  });

  it('IVA de las nuevas filas = nuevo PMT × 16%', () => {
    const out = aplicarPagoAdicionalFinanciero(original, 12, 100_000, 0.36, 0);
    const pmtNuevo = out[20].capital + out[20].interes;
    expect(out[20].iva).toBeCloseTo(pmtNuevo * 0.16, 1);
  });
});
