/**
 * Tests unitarios de calcMoratorioPorTramos y calcConceptos
 * (docs/LOGICA_COBRANZA.md §D2 — moratorio matemáticamente puro).
 *
 * Casos cubiertos:
 *   • Sin pagos del periodo → mor = base × tasa × días.
 *   • Pago completo (cubre renta total) → tramo parcial + base 0 después.
 *   • Pago que SÓLO cubre moratorio → base intacta, tramo continúa igual.
 *   • Pago parcial que toca AMBOS buckets → 2 tramos con bases distintas
 *     (caso del ejemplo de Damián: ~$196.69 total, NO ~$193.38).
 *   • Dos pagos parciales sucesivos → 3 tramos.
 *   • Pago pre-vencimiento → reduce base inicial, no genera mor por
 *     tramo previo.
 *   • Pago al exacto día de vencimiento → no genera mor en ese instante.
 *   • Pagos con montoRenta=0 mezclados con pagos que sí tocan renta →
 *     sólo los segundos crean breakpoints.
 *
 * Tasa moratoria de prueba: 0.002/día (= 72%/360 = 36% × 2 / 360),
 * mismo escenario que el ejemplo del overview.
 */
import { describe, it, expect } from 'vitest';
import { calcMoratorioPorTramos, calcConceptos } from '../cobranza';

const TASA_36_ANUAL = 0.36; // 72% mor / 360 = 0.002/día
const RENTA = 10_000;
const VENCIMIENTO = new Date('2026-01-15T12:00:00Z');

function diasDespues(base: Date, dias: number): Date {
  return new Date(base.getTime() + dias * 24 * 60 * 60 * 1000);
}

function makePayment(opts: {
  fechaDays: number;
  montoRenta?: number;
  montoMoratorio?: number;
  montoIVA?: number;
  montoIVAMoratorio?: number;
}) {
  return {
    id: 'p-' + opts.fechaDays,
    fechaPago: diasDespues(VENCIMIENTO, opts.fechaDays),
    montoRenta: opts.montoRenta ?? 0,
    montoIVA: opts.montoIVA ?? 0,
    montoMoratorio: opts.montoMoratorio ?? 0,
    montoIVAMoratorio: opts.montoIVAMoratorio ?? 0,
    montoTotal:
      (opts.montoRenta ?? 0) +
      (opts.montoIVA ?? 0) +
      (opts.montoMoratorio ?? 0) +
      (opts.montoIVAMoratorio ?? 0),
    referencia: null,
    diasAtraso: opts.fechaDays > 0 ? opts.fechaDays : 0,
  };
}

describe('calcMoratorioPorTramos', () => {
  it('sin pagos → mor = renta × tasa × días', () => {
    const corte = diasDespues(VENCIMIENTO, 10);
    const mor = calcMoratorioPorTramos(RENTA, TASA_36_ANUAL, VENCIMIENTO, corte, []);
    // 10000 × 0.002 × 10 = 200
    expect(mor).toBeCloseTo(200, 2);
  });

  it('fechaCorte = vencimiento → mor = 0 (no atraso aún)', () => {
    const mor = calcMoratorioPorTramos(RENTA, TASA_36_ANUAL, VENCIMIENTO, VENCIMIENTO, []);
    expect(mor).toBe(0);
  });

  it('fechaCorte ANTES de vencimiento → mor = 0', () => {
    const corte = diasDespues(VENCIMIENTO, -3);
    const mor = calcMoratorioPorTramos(RENTA, TASA_36_ANUAL, VENCIMIENTO, corte, []);
    expect(mor).toBe(0);
  });

  it('pago que SÓLO cubre moratorio → base sigue siendo $10k, mor sigue corriendo igual', () => {
    // Día 5: cliente paga $116 (cubre exacto $100 mor + $16 IVA mor)
    // Día 10: hasta aquí debería haber mor = $10k × 0.002 × 10 = $200
    //   (porque la base nunca bajó — el pago no tocó renta).
    const corte = diasDespues(VENCIMIENTO, 10);
    const pagos = [makePayment({ fechaDays: 5, montoMoratorio: 100, montoIVAMoratorio: 16 })];
    const mor = calcMoratorioPorTramos(RENTA, TASA_36_ANUAL, VENCIMIENTO, corte, pagos);
    expect(mor).toBeCloseTo(200, 2);
  });

  it('pago parcial que toca AMBOS buckets → 2 tramos con bases distintas', () => {
    // Caso de la conversación con Damián 2026-04-30:
    //   Día 5: cliente paga $500
    //     → split prelación: $100 mor + $16 IVA mor (total $116)
    //                       luego del balde renta $384 restante:
    //                       proporcional a 10000:1600 → $331.04 renta + $52.96 IVA
    //   Día 10:
    //     Tramo 1 (días 0..5): $10,000 × 0.002 × 5 = $100
    //     Tramo 2 (días 5..10): ($10,000 - $331.04) × 0.002 × 5
    //                         = $9,668.96 × 0.002 × 5 = $96.6896
    //     Total = $196.69 (al centavo)
    const corte = diasDespues(VENCIMIENTO, 10);
    const pagos = [
      makePayment({
        fechaDays: 5,
        montoRenta: 331.04,
        montoIVA: 52.96,
        montoMoratorio: 100,
        montoIVAMoratorio: 16,
      }),
    ];
    const mor = calcMoratorioPorTramos(RENTA, TASA_36_ANUAL, VENCIMIENTO, corte, pagos);
    expect(mor).toBeCloseTo(196.69, 1); // ±$0.10 por redondeos en el split
  });

  it('dos pagos parciales sucesivos → 3 tramos', () => {
    // Día 5: paga $5,000 a renta. Base baja a $5,000.
    // Día 10: paga otros $2,000 a renta. Base baja a $3,000.
    // Día 15:
    //   Tramo 1 (0..5):  10000 × 0.002 × 5 = 100
    //   Tramo 2 (5..10): 5000  × 0.002 × 5 = 50
    //   Tramo 3 (10..15): 3000 × 0.002 × 5 = 30
    //   Total = 180
    const corte = diasDespues(VENCIMIENTO, 15);
    const pagos = [
      makePayment({ fechaDays: 5, montoRenta: 5000 }),
      makePayment({ fechaDays: 10, montoRenta: 2000 }),
    ];
    const mor = calcMoratorioPorTramos(RENTA, TASA_36_ANUAL, VENCIMIENTO, corte, pagos);
    expect(mor).toBeCloseTo(180, 2);
  });

  it('pago COMPLETO al día 5 → mor = $10k × 0.002 × 5 = $100, después no hay tramo (base=0)', () => {
    const corte = diasDespues(VENCIMIENTO, 10);
    const pagos = [makePayment({ fechaDays: 5, montoRenta: 10000 })];
    const mor = calcMoratorioPorTramos(RENTA, TASA_36_ANUAL, VENCIMIENTO, corte, pagos);
    expect(mor).toBeCloseTo(100, 2);
  });

  it('pago PRE-vencimiento → reduce base inicial, no genera mor del tramo previo', () => {
    // 3 días ANTES del vencimiento, cliente paga $4,000 a renta.
    //   → base inicial efectiva = $6,000.
    // Al día 10 después del vencimiento:
    //   mor = $6,000 × 0.002 × 10 = $120.
    const corte = diasDespues(VENCIMIENTO, 10);
    const pagos = [makePayment({ fechaDays: -3, montoRenta: 4000 })];
    const mor = calcMoratorioPorTramos(RENTA, TASA_36_ANUAL, VENCIMIENTO, corte, pagos);
    expect(mor).toBeCloseTo(120, 2);
  });

  it('mix pagos solo-mor + pagos con renta → sólo los que tocan renta crean breakpoints', () => {
    // Día 3: paga sólo mor ($60) → base intacta.
    // Día 7: paga mor + algo de renta ($2,000 a renta).
    // Día 10:
    //   Tramo 1 (0..7): 10000 × 0.002 × 7 = 140
    //     (los días 0..3 y 3..7 tienen la misma base; el pago día 3 no
    //      cierra tramo porque montoRenta=0)
    //   Tramo 2 (7..10): 8000 × 0.002 × 3 = 48
    //   Total = 188
    const corte = diasDespues(VENCIMIENTO, 10);
    const pagos = [
      makePayment({ fechaDays: 3, montoMoratorio: 60 }),
      makePayment({ fechaDays: 7, montoRenta: 2000, montoMoratorio: 30 }),
    ];
    const mor = calcMoratorioPorTramos(RENTA, TASA_36_ANUAL, VENCIMIENTO, corte, pagos);
    expect(mor).toBeCloseTo(188, 2);
  });

  it('pago en el futuro respecto a fechaCorte → ignorado (no afecta mor)', () => {
    // Día 5 futuro: cliente paga renta completa, pero fechaCorte = día 3.
    // Para fechaCorte=día 3, el pago todavía no ha ocurrido — mor debe
    // calcularse sin él.
    const corte = diasDespues(VENCIMIENTO, 3);
    const pagos = [makePayment({ fechaDays: 5, montoRenta: 10000 })];
    const mor = calcMoratorioPorTramos(RENTA, TASA_36_ANUAL, VENCIMIENTO, corte, pagos);
    // 10000 × 0.002 × 3 = 60
    expect(mor).toBeCloseTo(60, 2);
  });

  it('escala de tasa: 24% ordinaria → 48% moratoria', () => {
    // tasaDiaria = (0.24 × 2) / 360 = 0.001333...
    // 10 días × 10000 × 0.001333 = 133.33
    const corte = diasDespues(VENCIMIENTO, 10);
    const mor = calcMoratorioPorTramos(RENTA, 0.24, VENCIMIENTO, corte, []);
    expect(mor).toBeCloseTo(133.33, 1);
  });
});

describe('calcConceptos (integración con calcMoratorioPorTramos)', () => {
  const ENTRY = {
    periodo: 1,
    fechaPago: VENCIMIENTO,
    renta: 10000,
    iva: 1600,
    pagoTotal: 11600,
    saldoInicial: 0,
    saldoFinal: 0,
  };

  it('periodo en mora sin pagos → reporta moratorio matemáticamente puro y estatus VENCIDO', () => {
    const corte = diasDespues(VENCIMIENTO, 10);
    const c = calcConceptos(ENTRY, TASA_36_ANUAL, [], corte);
    expect(c.estatus).toBe('VENCIDO');
    expect(c.diasAtraso).toBe(10);
    expect(c.moratorio.generado).toBeCloseTo(200, 2);
    expect(c.moratorio.ivaGenerado).toBeCloseTo(32, 2); // 200 × 16%
    expect(c.moratorio.pendiente).toBeCloseTo(200, 2);
    expect(c.desglose.totalAdeudado).toBeCloseTo(11600 + 200 + 32, 2);
  });

  it('periodo con pago parcial mixto → moratorio refleja los 2 tramos', () => {
    // Mismo caso que el test de calcMoratorioPorTramos #4: $196.69 total.
    // Lo que ya se pagó de mor: $100 + $16 IVA mor.
    // Pendiente: $196.69 - $100 = $96.69 mor + IVA $15.47.
    const corte = diasDespues(VENCIMIENTO, 10);
    const pagos = [
      makePayment({
        fechaDays: 5,
        montoRenta: 331.04,
        montoIVA: 52.96,
        montoMoratorio: 100,
        montoIVAMoratorio: 16,
      }),
    ];
    const c = calcConceptos(ENTRY, TASA_36_ANUAL, pagos, corte);
    expect(c.moratorio.generado).toBeCloseTo(196.69, 1);
    expect(c.moratorio.pagado).toBeCloseTo(100, 2);
    expect(c.moratorio.pendiente).toBeCloseTo(96.69, 1);
    // estatus: la renta no está completamente cubierta → PARCIAL
    expect(c.estatus).toBe('PARCIAL');
  });

  it('periodo PAGADO completo → mor=0 y estatus PAGADO', () => {
    // Cliente paga todo (renta + IVA + mor + IVA mor) al día 5.
    const corte = diasDespues(VENCIMIENTO, 10);
    const pagos = [
      makePayment({
        fechaDays: 5,
        montoRenta: 10000,
        montoIVA: 1600,
        montoMoratorio: 100,
        montoIVAMoratorio: 16,
      }),
    ];
    const c = calcConceptos(ENTRY, TASA_36_ANUAL, pagos, corte);
    expect(c.estatus).toBe('PAGADO');
    expect(c.moratorio.pendiente).toBeCloseTo(0, 2);
    expect(c.desglose.totalAdeudado).toBeCloseTo(0, 2);
  });

  it('periodo NO vencido (fechaCorte antes del vencimiento) → estatus FUTURO, mor=0', () => {
    const corte = diasDespues(VENCIMIENTO, -5);
    const c = calcConceptos(ENTRY, TASA_36_ANUAL, [], corte);
    expect(c.estatus).toBe('FUTURO');
    expect(c.moratorio.generado).toBe(0);
    expect(c.diasAtraso).toBe(0);
  });
});
