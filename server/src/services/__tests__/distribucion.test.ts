/**
 * Tests del espejo server-side de la distribución de aporte inicial.
 * El cliente tiene su propia suite (`client/src/lib/cotizacion/__tests__/
 * distribucion.test.ts`) — esta cubre la validación cruzada que sólo
 * vive en el server.
 */
import { describe, it, expect } from 'vitest';
import { distribuirAporte, validarDistribucion } from '../distribucion';

describe('distribuirAporte (server) — paridad con cliente', () => {
  it('Bajo 18% → 8% eng + 10% DG (opción A)', () => {
    const r = distribuirAporte('A', 0.18);
    expect(r.enganchePct).toBeCloseTo(0.08, 4);
    expect(r.depositoGarantiaPct).toBe(0.10);
    expect(r.opcionBajo).toBe('A');
  });

  it('Bajo 20% → 15% eng + 5% DG (corte estricto a opción B)', () => {
    const r = distribuirAporte('A', 0.20);
    expect(r.enganchePct).toBeCloseTo(0.15, 4);
    expect(r.depositoGarantiaPct).toBe(0.05);
    expect(r.opcionBajo).toBe('B');
  });

  it('Medio 25% → 15% eng + 10% DG', () => {
    const r = distribuirAporte('B', 0.25);
    expect(r.enganchePct).toBeCloseTo(0.15, 4);
    expect(r.depositoGarantiaPct).toBe(0.10);
  });

  it('Alto 30% → 10% eng + 20% DG', () => {
    const r = distribuirAporte('C', 0.30);
    expect(r.enganchePct).toBeCloseTo(0.10, 4);
    expect(r.depositoGarantiaPct).toBe(0.20);
  });
});

describe('validarDistribucion', () => {
  it('coherente Medio 25% → null (OK)', () => {
    const err = validarDistribucion({
      nivelRiesgo: 'B',
      aporteInicialPct: 0.25,
      enganchePct: 0.15,
      depositoGarantiaPct: 0.10,
      edicionManual: false,
    });
    expect(err).toBeNull();
  });

  it('Bajo 25% con DG=10% (esperado 5%) → error', () => {
    const err = validarDistribucion({
      nivelRiesgo: 'A',
      aporteInicialPct: 0.25,        // > 20% → opción B (DG=5%)
      enganchePct: 0.15,
      depositoGarantiaPct: 0.10,     // pero envió 10% → incoherente
      edicionManual: false,
    });
    expect(err).toMatch(/Distribución incoherente/);
  });

  it('Alto 30% con DG=10% (esperado 20%) → error', () => {
    const err = validarDistribucion({
      nivelRiesgo: 'C',
      aporteInicialPct: 0.30,
      enganchePct: 0.20,
      depositoGarantiaPct: 0.10,
      edicionManual: false,
    });
    expect(err).toMatch(/Distribución incoherente/);
  });

  it('edicionManual=true permite cualquier distribución coherente con sí misma', () => {
    const err = validarDistribucion({
      nivelRiesgo: 'A',
      aporteInicialPct: 0.40,
      enganchePct: 0.30,
      depositoGarantiaPct: 0.10,     // overrride manual: paso aunque no coincida
      edicionManual: true,
    });
    expect(err).toBeNull();
  });

  it('edicionManual=true rechaza valores negativos', () => {
    const err = validarDistribucion({
      nivelRiesgo: 'B',
      aporteInicialPct: 0.20,
      enganchePct: -0.05,
      depositoGarantiaPct: 0.10,
      edicionManual: true,
    });
    expect(err).toMatch(/negativos/);
  });

  it('edicionManual=true rechaza enganche+DG > 100%', () => {
    const err = validarDistribucion({
      nivelRiesgo: 'B',
      aporteInicialPct: 1.5,
      enganchePct: 0.80,
      depositoGarantiaPct: 0.50,
      edicionManual: true,
    });
    expect(err).toMatch(/100%/);
  });

  it('tolerancia: 0.0001 de diferencia se acepta', () => {
    const err = validarDistribucion({
      nivelRiesgo: 'B',
      aporteInicialPct: 0.20,
      enganchePct: 0.1001,           // tolerancia 0.001
      depositoGarantiaPct: 0.0999,
      edicionManual: false,
    });
    expect(err).toBeNull();
  });
});
