import { describe, it, expect } from 'vitest';
import {
  valorBienTecleadoASinIVA,
  valorBienSinIVAATecleado,
} from '../valorBienIVA';

describe('valorBienIVA — conversión del campo "Valor del Bien"', () => {
  describe('modo SIN IVA (incluyeIVA = false): identidad', () => {
    it('teclado → sin IVA es identidad', () => {
      expect(valorBienTecleadoASinIVA(1_810_344.83, false)).toBe(1_810_344.83);
      expect(valorBienTecleadoASinIVA(500_000, false)).toBe(500_000);
      expect(valorBienTecleadoASinIVA(0, false)).toBe(0);
    });
    it('sin IVA → display es identidad', () => {
      expect(valorBienSinIVAATecleado(1_810_344.83, false)).toBe(1_810_344.83);
      expect(valorBienSinIVAATecleado(0, false)).toBe(0);
    });
  });

  describe('modo CON IVA (incluyeIVA = true): divide / multiplica por 1.16', () => {
    it('teclado con IVA → sin IVA (÷1.16, precisión completa)', () => {
      // 2,100,000 / 1.16 = 1,810,344.827586… — se guarda a precisión
      // COMPLETA (sin redondear) para que el round-trip del display sea
      // exacto. El motor redondea en la salida.
      expect(valorBienTecleadoASinIVA(2_100_000, true)).toBeCloseTo(1_810_344.83, 2);
      // 580,000 / 1.16 = 500,000.00 exacto
      expect(valorBienTecleadoASinIVA(580_000, true)).toBe(500_000);
    });
    it('sin IVA → display con IVA (×1.16, 2 decimales)', () => {
      expect(valorBienSinIVAATecleado(1_810_344.83, true)).toBe(2_100_000);
      expect(valorBienSinIVAATecleado(500_000, true)).toBe(580_000);
    });
    it('0 se mantiene en 0 en ambas direcciones', () => {
      expect(valorBienTecleadoASinIVA(0, true)).toBe(0);
      expect(valorBienSinIVAATecleado(0, true)).toBe(0);
    });
  });

  describe('round-trip del display EXACTO al centavo (cualquier valor ≤2 dec)', () => {
    // Lo que teclea el operador (con IVA) debe volver IDÉNTICO tras
    // ida-y-vuelta. Incluye los valores que con redondeo de la verdad
    // interna derivaban $0.01 (1,000,000 y el mínimo 150,000) — bug
    // cosmético detectado por el wiring-reviewer, ya corregido.
    for (const conIVA of [
      2_100_000, 1_500_000, 580_000, 3_480_000, 174_000,
      1_000_000, 150_000, 999_999.99, 2_100_000.01, 1_234_567.89,
    ]) {
      it(`${conIVA.toLocaleString('es-MX')} con IVA round-trips exacto`, () => {
        const sinIVA = valorBienTecleadoASinIVA(conIVA, true);
        expect(valorBienSinIVAATecleado(sinIVA, true)).toBe(conIVA);
      });
    }
  });

  it('Decimal.js (no float crudo) en el DISPLAY: 1,810,344.83 × 1.16 → 2,100,000.00', () => {
    // El helper de display sí redondea a 2 decimales con Decimal: el
    // float crudo 1810344.83*1.16 = 2100000.0028 → debe mostrar 2,100,000.00.
    expect(valorBienSinIVAATecleado(1_810_344.83, true)).toBe(2_100_000);
    expect(1_810_344.83 * 1.16).not.toBe(2_100_000);
  });
});
