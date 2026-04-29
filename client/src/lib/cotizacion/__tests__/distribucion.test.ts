/**
 * Tests de la distribución de aporte inicial entre enganche y DG.
 *
 * Cubre los 9 casos numéricos acordados con Damián el 27-04-2026 +
 * casos edge (debajo del mínimo, 0%, exactamente en el corte de 20%).
 *
 * Ver `distribucion.ts` para la regla completa.
 */
import { describe, it, expect } from 'vitest';
import { distribuirAporte, lemaOpcionBajo, MINIMOS_NIVEL } from '../distribucion';

// Helpers para clarificar los expects: trabajamos en escala 0..1.
const pct = (n: number) => Math.round(n * 10000) / 10000;

describe('distribuirAporte — Riesgo BAJO (A)', () => {
  it('15% (mínimo) → opción A pura: 5% eng + 10% DG', () => {
    const r = distribuirAporte('A', 0.15);
    expect(pct(r.enganchePct)).toBe(0.05);
    expect(pct(r.depositoGarantiaPct)).toBe(0.10);
    expect(r.opcionBajo).toBe('A');
    expect(r.valido).toBe(true);
    expect(r.warning).toBeNull();
  });

  it('18% → opción A con exceso al enganche: 8% + 10%', () => {
    const r = distribuirAporte('A', 0.18);
    expect(pct(r.enganchePct)).toBe(0.08);
    expect(pct(r.depositoGarantiaPct)).toBe(0.10);
    expect(r.opcionBajo).toBe('A');
    expect(r.valido).toBe(true);
  });

  it('20% (corte exacto) → switch a opción B: 15% eng + 5% DG', () => {
    // Per Damián: aporte = 20% NO es A límite, es B comenzando.
    const r = distribuirAporte('A', 0.20);
    expect(pct(r.enganchePct)).toBe(0.15);
    expect(pct(r.depositoGarantiaPct)).toBe(0.05);
    expect(r.opcionBajo).toBe('B');
    expect(r.valido).toBe(true);
  });

  it('22% → opción B con exceso: 17% eng + 5% DG', () => {
    const r = distribuirAporte('A', 0.22);
    expect(pct(r.enganchePct)).toBe(0.17);
    expect(pct(r.depositoGarantiaPct)).toBe(0.05);
    expect(r.opcionBajo).toBe('B');
  });

  it('30% → opción B con más exceso: 25% eng + 5% DG', () => {
    const r = distribuirAporte('A', 0.30);
    expect(pct(r.enganchePct)).toBe(0.25);
    expect(pct(r.depositoGarantiaPct)).toBe(0.05);
    expect(r.opcionBajo).toBe('B');
  });

  it('14% (debajo del mínimo) → valido=false, warning con texto del mínimo', () => {
    const r = distribuirAporte('A', 0.14);
    expect(r.valido).toBe(false);
    expect(r.warning).toMatch(/15%/);
    expect(r.opcionBajo).toBe('A');
  });

  it('19.99% (justo antes del corte) → opción A', () => {
    // Para asegurarnos de que el corte es estricto: < 20% es A, ≥ 20% es B.
    const r = distribuirAporte('A', 0.1999);
    expect(r.opcionBajo).toBe('A');
    expect(pct(r.depositoGarantiaPct)).toBe(0.10);
  });
});

describe('distribuirAporte — Riesgo MEDIO (B)', () => {
  it('20% (mínimo) → 10% eng + 10% DG', () => {
    const r = distribuirAporte('B', 0.20);
    expect(pct(r.enganchePct)).toBe(0.10);
    expect(pct(r.depositoGarantiaPct)).toBe(0.10);
    expect(r.opcionBajo).toBeNull();
    expect(r.valido).toBe(true);
  });

  it('25% → exceso al enganche: 15% + 10%', () => {
    const r = distribuirAporte('B', 0.25);
    expect(pct(r.enganchePct)).toBe(0.15);
    expect(pct(r.depositoGarantiaPct)).toBe(0.10);
    expect(r.valido).toBe(true);
  });

  it('15% (debajo) → warning, no valido', () => {
    const r = distribuirAporte('B', 0.15);
    expect(r.valido).toBe(false);
    expect(r.warning).toMatch(/20%/);
  });
});

describe('distribuirAporte — Riesgo ALTO (C)', () => {
  it('30% (mínimo) → 10% eng + 20% DG', () => {
    const r = distribuirAporte('C', 0.30);
    expect(pct(r.enganchePct)).toBe(0.10);
    expect(pct(r.depositoGarantiaPct)).toBe(0.20);
    expect(r.valido).toBe(true);
  });

  it('50% → exceso al enganche: 30% + 20%', () => {
    const r = distribuirAporte('C', 0.50);
    expect(pct(r.enganchePct)).toBe(0.30);
    expect(pct(r.depositoGarantiaPct)).toBe(0.20);
    expect(r.valido).toBe(true);
  });

  it('25% (debajo) → warning, no valido', () => {
    const r = distribuirAporte('C', 0.25);
    expect(r.valido).toBe(false);
    expect(r.warning).toMatch(/30%/);
  });
});

describe('distribuirAporte — Edge cases', () => {
  it('aporte negativo → no rompe, devuelve warning', () => {
    const r = distribuirAporte('B', -0.05);
    expect(r.valido).toBe(false);
    expect(r.warning).toMatch(/negativo/);
  });

  it('aporte 0% → no valido pero devuelve mínimos del nivel para que el cotizador siga calculando', () => {
    const r = distribuirAporte('B', 0);
    expect(r.valido).toBe(false);
    expect(pct(r.depositoGarantiaPct)).toBe(MINIMOS_NIVEL.B.dgFijo);
  });

  it('aporte 100% en alto → 80% eng + 20% DG (extremo)', () => {
    const r = distribuirAporte('C', 1.0);
    expect(pct(r.enganchePct)).toBe(0.80);
    expect(pct(r.depositoGarantiaPct)).toBe(0.20);
    expect(r.valido).toBe(true);
  });
});

describe('lemaOpcionBajo', () => {
  it('A → "Menor desembolso"', () => {
    expect(lemaOpcionBajo('A')).toBe('Menor desembolso');
  });
  it('B → "Menor renta"', () => {
    expect(lemaOpcionBajo('B')).toBe('Menor renta');
  });
  it('null → null', () => {
    expect(lemaOpcionBajo(null)).toBeNull();
  });
});
