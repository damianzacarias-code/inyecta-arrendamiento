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
import { calcAmortPuro, calcAmortFinanciero } from '../amortizacion';

const baseInputs = {
  valorBienConIVA: 2_100_000,
  tasaIVA: 0.16,
  plazo: 48,
  tasaAnual: 0.36,
  tasaComisionApertura: 0.05,
  comisionAperturaEsContado: false,
  porcentajeResidual: 0.16,
  gpsMonto: 16_000,
  gpsEsContado: false,
  seguroMonto: 0,
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

  it('valor de rescate display = $353,170.76 (16% sobre montoTotalDisplay)', () => {
    expect(cot.residual.monto).toBeCloseTo(353_170.76, 2);
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
    porcentajeResidual: 0.02,
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

  it('opción de compra display = $44,146.34 (2% sobre montoTotalDisplay)', () => {
    expect(cot.residual.monto).toBeCloseTo(44_146.34, 2);
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
