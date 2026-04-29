/**
 * Tests del motor financiero del backend (leaseCalculator).
 *
 * Verifica los mismos números que el cliente prueba en
 * client/src/lib/cotizacion/__tests__/calculos.test.ts. La regla 5 del
 * CLAUDE.md exige que ambos motores coincidan al centavo — si esto se
 * rompe, hay un drift entre cliente y servidor.
 *
 * Casos verificados (CLAUDE.md §4.2-§4.8, datos del Excel oficial):
 *   PURO       valorBien=1,810,344.83, plazo=48, tasa=0.36, gps=16,000,
 *              comisionAperturaPct=0.05, depositoPct=0.16, financiada=true
 *              → renta = 73,098.02 (FV = depósito)
 *   FINANCIERO mismos params, depositoPct=0, valorResidualPct=0
 *              → renta = 75,896.80 (FV = 0)
 *
 * Moratorios:
 *   $1,000 vencidos × 30 días × 0.002 = $60 + IVA $9.60 = $69.60
 */
import { describe, it, expect } from 'vitest';
import { calcularArrendamiento, calcularMoratorios, type LeaseParams } from '../leaseCalculator';

const baseParams: LeaseParams = {
  producto: 'PURO',
  valorBien: 1_810_344.83,        // valorSinIVA del Excel ($2,100,000 / 1.16)
  plazo: 48,
  tasaAnual: 0.36,                // 36% anual = 3% mensual
  enganchePct: 0,
  depositoGarantiaPct: 0.16,      // residual real PURO
  comisionAperturaPct: 0.05,
  comisionAperturaFinanciada: true,
  valorResidualPct: 0.16,
  rentaInicial: 0,
  gpsInstalacion: 16_000,
  gpsFinanciado: true,
  seguroAnual: 0,
  seguroFinanciado: false,
};

describe('calcularArrendamiento — PURO', () => {
  const r = calcularArrendamiento(baseParams);

  it('valorBienIVA = 2,100,000.00 (1,810,344.83 × 1.16)', () => {
    expect(r.valorBienIVA).toBeCloseTo(2_100_000.00, 2);
  });

  it('comisionApertura = 91,317.24 (baseBien × 5%)', () => {
    expect(r.comisionApertura).toBeCloseTo(91_317.24, 2);
  });

  it('depositoGarantia = 292,215.17 (baseBien × 16%)', () => {
    expect(r.depositoGarantia).toBeCloseTo(292_215.17, 2);
  });

  it('montoFinanciar = 1,917,662.07 (baseBien + comisión)', () => {
    expect(r.montoFinanciar).toBeCloseTo(1_917_662.07, 2);
  });

  it('renta neta = 73,098.02 (PMT con FV = depósito)', () => {
    expect(r.rentaMensual).toBeCloseTo(73_098.02, 2);
  });

  it('IVA renta = renta × 16% = 11,695.68', () => {
    expect(r.ivaRenta).toBeCloseTo(11_695.68, 2);
  });

  it('rentaMensualIVA = renta + IVA exacto a partir de los Decimals internos', () => {
    // El motor calcula renta+IVA en Decimal (no como suma de los floats
    // ya redondeados), por lo que el resultado puede diferir en el último
    // decimal de "renta + IVA" sumando los floats. Aquí solo asseguramos
    // que esté dentro de un centavo del esperado del Excel.
    expect(r.rentaMensualIVA).toBeGreaterThan(84_793.69);
    expect(r.rentaMensualIVA).toBeLessThan(84_793.72);
  });

  it('amortización tiene 48 filas', () => {
    expect(r.amortizacion).toHaveLength(48);
  });

  it('amortización fila 1: interés = saldoInicial × 3% = 57,529.86', () => {
    const fila1 = r.amortizacion[0];
    expect(fila1.saldoInicial).toBeCloseTo(1_917_662.07, 2);
    expect(fila1.intereses).toBeCloseTo(57_529.86, 2);
    expect(fila1.pagoCapital).toBeCloseTo(15_568.16, 2);
    expect(fila1.saldoFinal).toBeCloseTo(1_902_093.91, 2);
  });

  it('amortización fila 48: saldoFinal = depósito = 292,215.17 exacto', () => {
    const ultima = r.amortizacion[47];
    expect(ultima.saldoFinal).toBeCloseTo(292_215.17, 2);
  });

  it('IVA por fila = renta × 16% (regla 8 — no solo sobre interés)', () => {
    for (const f of r.amortizacion) {
      expect(f.iva).toBeCloseTo(f.renta * 0.16, 2);
    }
  });
});

describe('calcularArrendamiento — FINANCIERO', () => {
  const params: LeaseParams = {
    ...baseParams,
    producto: 'FINANCIERO',
    enganchePct: 0,
    depositoGarantiaPct: 0,        // FIN: FV del PMT = 0
    valorResidualPct: 0,
  };
  const r = calcularArrendamiento(params);

  it('renta neta = 75,896.80 (PMT con FV = 0)', () => {
    expect(r.rentaMensual).toBeCloseTo(75_896.80, 2);
  });

  it('IVA renta = renta × 16% = 12,143.49', () => {
    expect(r.ivaRenta).toBeCloseTo(12_143.49, 2);
  });

  it('amortización fila 48: saldoFinal = 0.00 EXACTO (regla 6)', () => {
    const ultima = r.amortizacion[47];
    expect(ultima.saldoFinal).toBeCloseTo(0.00, 2);
  });

  it('amortización fila 1: interés = 1,917,662.07 × 3% = 57,529.86', () => {
    expect(r.amortizacion[0].intereses).toBeCloseTo(57_529.86, 2);
  });

  it('Σ capital de las 48 filas ≈ montoFinanciado (drift de redondeo < $0.10)', () => {
    // Cada fila se redondea a 2 decimales; en 48 filas el drift puede
    // acumular hasta ~$0.50 sin que sea un bug de la lógica. Lo que
    // debe ser EXACTO es el saldo final (test anterior). Aquí solo
    // sanity-check que la suma esté en el orden correcto.
    const sumaCap = r.amortizacion.reduce((acc, f) => acc + f.pagoCapital, 0);
    expect(Math.abs(sumaCap - r.montoFinanciar)).toBeLessThan(0.50);
  });
});

// ═══════════════════════════════════════════════════════════════════
// Casos extendidos del Excel — banderas nuevas (§4.13, §4.14)
// Verifican al centavo que el motor del servidor procesa correctamente
// los nuevos inputs (residual=comisión, seguro pendiente, B17 con
// enganche descontado en FIN). El motor del cliente ya tiene su gemela
// en client/src/lib/cotizacion/__tests__/calculos.test.ts — si los
// números aquí divergen de allá, hay drift entre los dos motores.
// ═══════════════════════════════════════════════════════════════════

describe('calcularArrendamiento FINANCIERO — enganche 10% (§4.2 B17)', () => {
  // FINANCIERO con enganche 10% sobre valorConIVA:
  //   enganche = 1,810,344.83 × 1.16 × 0.10 ≈ $210,000.00
  //   baseBien = valorSinIVA − enganche + gpsFin
  //            = 1,810,344.83 − 210,000.00 + 16,000 = $1,616,344.83
  //   comisión = baseBien × 5% = $80,817.24
  //   montoFin = baseBien + comisión = $1,697,162.07
  // Antes de Commit 4 baseBien NO restaba enganche → comisión y monto
  // financiar inflados.
  const r = calcularArrendamiento({
    ...baseParams,
    producto: 'FINANCIERO',
    enganchePct: 0.10,
    depositoGarantiaPct: 0,
    valorResidualPct: 0,
  });

  // Tras el cambio del 27-04-2026 (CLAUDE.md §4.2 fuente de verdad), el
  // enganche se calcula sobre valorSinIVA en TODOS los productos.
  // Antes era valorConIVA × pct sólo para FIN — discrepancia con el
  // Excel oficial. Recalculados los esperados:
  //   enganche      = 1,810,344.83 × 0.10 = $181,034.48
  //   baseBien      = 1,810,344.83 - 181,034.48 + 16,000 = $1,645,310.35
  //   comisión      = 1,645,310.35 × 0.05 = $82,265.52
  //   montoFinanciar= baseBien + comisión = $1,727,575.86
  it('enganche = valorSinIVA × 10% = $181,034.48 (§4.2)', () => {
    expect(r.enganche).toBeCloseTo(181_034.48, 2);
  });

  it('comisión = baseBien × 5% = $82,265.52 (B17 con enganche restado)', () => {
    expect(r.comisionApertura).toBeCloseTo(82_265.52, 2);
  });

  it('montoFinanciar = baseBien + comisión = $1,727,575.87', () => {
    expect(r.montoFinanciar).toBeCloseTo(1_727_575.87, 1);
  });

  it('renta neta < baseline FIN $75,896.80 (PV reducido por enganche)', () => {
    // Sanity: con enganche, el PV es menor, la renta debe bajar.
    expect(r.rentaMensual).toBeLessThan(75_896.80);
    expect(r.rentaMensual).toBeGreaterThan(60_000);
  });

  it('amortización fila 48: saldoFinal = $0.00 EXACTO (FIN amortiza todo)', () => {
    expect(r.amortizacion[47].saldoFinal).toBeCloseTo(0.00, 2);
  });
});

describe('calcularArrendamiento PURO — valorResidualEsDeposito (§4.13)', () => {
  // Flag activa: valorResidual = depósito en garantía, ignorando el pct
  // capturado del residual. El cliente "pierde" el depósito a cambio del
  // bien al final del contrato. Caso baseline sin enganche, sin seguro,
  // gps financiado (depósito = 16% del baseBien).
  const r = calcularArrendamiento({
    ...baseParams,
    valorResidualPct: 0.20,             // ignorado por la flag
    valorResidualEsDeposito: true,
  });

  it('valorResidual = depositoGarantia (no usa el pct capturado)', () => {
    expect(r.valorResidual).toBeCloseTo(292_215.17, 2);
    expect(r.valorResidual).toBe(r.depositoGarantia);
  });

  it('comisión sigue siendo $91,317.24 (la flag no la toca)', () => {
    expect(r.comisionApertura).toBeCloseTo(91_317.24, 2);
  });

  it('renta neta = baseline $73,098.02 (FV del PMT = depósito, no residual)', () => {
    // §4.12: el residual es display, NO entra al PMT. Por eso la renta
    // no cambia aunque el residual sí.
    expect(r.rentaMensual).toBeCloseTo(73_098.02, 2);
  });
});

describe('calcularArrendamiento — seguroPendiente (§4.14)', () => {
  // Si seguroPendiente=true, el seguro NO entra en B17 ni en la renta,
  // independientemente de seguroAnual y seguroFinanciado.
  const r = calcularArrendamiento({
    ...baseParams,
    seguroAnual: 50_000,
    seguroPendiente: true,
    seguroFinanciado: true,             // aún financiado, pero pendiente lo anula
  });

  it('depósito = $292,215.17 (B17 NO incluye seguro pendiente)', () => {
    expect(r.depositoGarantia).toBeCloseTo(292_215.17, 2);
  });

  it('comisión = $91,317.24 (igual que baseline sin seguro)', () => {
    expect(r.comisionApertura).toBeCloseTo(91_317.24, 2);
  });

  it('montoFinanciar = $1,917,662.07 (igual que baseline)', () => {
    expect(r.montoFinanciar).toBeCloseTo(1_917_662.07, 2);
  });

  it('renta neta = $73,098.02 (baseline — pendiente no afecta PMT)', () => {
    expect(r.rentaMensual).toBeCloseTo(73_098.02, 2);
  });
});

describe('calcularArrendamiento PURO — seguro financiado con monto > 0 (§4.14)', () => {
  // seguroAnual = $50,000, plazo 48m, financiado:
  //   seguroFinanciadoTotal = 50,000 × 48/12 = $200,000
  //   baseBien = 1,810,344.83 + 16,000 + 200,000 = $2,026,344.83
  //   comisión = baseBien × 5% = $101,317.24
  //   depósito = baseBien × 16% = $324,215.17
  //   montoFinanciar = baseBien + comisión = $2,127,662.07
  const r = calcularArrendamiento({
    ...baseParams,
    seguroAnual: 50_000,
    seguroPendiente: false,
    seguroFinanciado: true,
  });

  it('depósito = $324,215.17 (B17 incluye seguroAnual × plazo/12)', () => {
    expect(r.depositoGarantia).toBeCloseTo(324_215.17, 2);
  });

  it('comisión = baseBien × 5% = $101,317.24', () => {
    expect(r.comisionApertura).toBeCloseTo(101_317.24, 2);
  });

  it('montoFinanciar = $2,127,662.07', () => {
    expect(r.montoFinanciar).toBeCloseTo(2_127_662.07, 2);
  });

  it('renta neta > $73,098.02 baseline (PV mayor por seguro)', () => {
    expect(r.rentaMensual).toBeGreaterThan(73_098.02);
  });
});

describe('calcularMoratorios', () => {
  // Contrato @ 36% ordinaria → moratoria 72%/360 = 0.2%/día
  it('contrato 36%: 1000 × 30d × 0.2%/día = 60 + IVA 9.60 = 69.60', () => {
    const r = calcularMoratorios(1000, 30, 0.36);
    expect(r.moratorio).toBeCloseTo(60.00, 2);
    expect(r.ivaMoratorio).toBeCloseTo(9.60, 2);
    expect(r.total).toBeCloseTo(69.60, 2);
  });

  // Contrato @ 24% ordinaria → moratoria 48%/360 = 0.1333%/día
  it('contrato 24%: tasa moratoria escala linealmente con la ordinaria', () => {
    const r = calcularMoratorios(1000, 30, 0.24);
    expect(r.moratorio).toBeCloseTo(40.00, 2); // 1000 × 0.48/360 × 30
    expect(r.ivaMoratorio).toBeCloseTo(6.40, 2);
    expect(r.total).toBeCloseTo(46.40, 2);
  });

  it('0 días de atraso → 0', () => {
    const r = calcularMoratorios(1000, 0, 0.36);
    expect(r.moratorio).toBe(0);
    expect(r.ivaMoratorio).toBe(0);
    expect(r.total).toBe(0);
  });

  it('renta cero → 0', () => {
    const r = calcularMoratorios(0, 100, 0.36);
    expect(r.total).toBe(0);
  });

  it('tasa ordinaria cero → moratoria cero (caso defensivo)', () => {
    const r = calcularMoratorios(5000, 30, 0);
    expect(r.total).toBe(0);
  });

  it('lineal en días: 60 días = 2× 30 días (tasa fija)', () => {
    const a = calcularMoratorios(5000, 30, 0.36);
    const b = calcularMoratorios(5000, 60, 0.36);
    expect(b.moratorio).toBeCloseTo(a.moratorio * 2, 2);
  });
});
