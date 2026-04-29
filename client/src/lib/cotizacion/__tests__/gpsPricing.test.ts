/**
 * Tests de la lógica de pricing GPS y selección de proveedor por
 * valor del bien y plazo. Reglas Damián 28-04-2026.
 */
import { describe, it, expect } from 'vitest';
import {
  proveedorDefault,
  precioGpsPorPlazo,
  calcularPrecioGps,
  UMBRAL_VALOR_BIEN_TECNO,
  type GpsProveedor,
} from '../gpsPricing';

const GBR: GpsProveedor = {
  clave: 'GBR', nombre: 'GBR', descripcion: 'GPS sencillo',
  precio24m: 6380, precio36m: 7820, precio48m: 9260,
  orden: 1, activo: true,
};
const TECNO: GpsProveedor = {
  clave: 'TECNO_LOGISTIC', nombre: 'Tecno Logistic', descripcion: 'GPS + tracker de mantenimiento',
  precio24m: 8800, precio36m: 12400, precio48m: 16000,
  orden: 2, activo: true,
};
const PROVS = [GBR, TECNO];

describe('proveedorDefault', () => {
  it('Bien $250,000 (< 500k) → GBR', () => {
    expect(proveedorDefault(250_000)).toBe('GBR');
  });

  it('Bien $499,999 (< 500k) → GBR', () => {
    expect(proveedorDefault(499_999)).toBe('GBR');
  });

  it('Bien $500,000 (= umbral) → TECNO_LOGISTIC', () => {
    // Umbral inclusivo hacia arriba per regla "≥ $500,000 → Tecno"
    expect(proveedorDefault(500_000)).toBe('TECNO_LOGISTIC');
  });

  it('Bien $1,000,000 → TECNO_LOGISTIC', () => {
    expect(proveedorDefault(1_000_000)).toBe('TECNO_LOGISTIC');
  });

  it('UMBRAL constante exportada = 500,000', () => {
    expect(UMBRAL_VALOR_BIEN_TECNO).toBe(500_000);
  });
});

describe('precioGpsPorPlazo — redondeo hacia plazo mayor', () => {
  it('plazo 24 → precio24m', () => {
    expect(precioGpsPorPlazo(GBR, 24)).toBe(6380);
  });
  it('plazo 36 → precio36m', () => {
    expect(precioGpsPorPlazo(GBR, 36)).toBe(7820);
  });
  it('plazo 48 → precio48m', () => {
    expect(precioGpsPorPlazo(GBR, 48)).toBe(9260);
  });

  // Plazos NO en la tabla: redondea al siguiente plazo mayor.
  it('plazo 12 (< 24) → precio24m', () => {
    expect(precioGpsPorPlazo(GBR, 12)).toBe(6380);
  });
  it('plazo 18 (< 24) → precio24m', () => {
    expect(precioGpsPorPlazo(GBR, 18)).toBe(6380);
  });
  it('plazo 30 (entre 24 y 36) → precio36m', () => {
    expect(precioGpsPorPlazo(GBR, 30)).toBe(7820);
  });
  it('plazo 42 (entre 36 y 48) → precio48m', () => {
    expect(precioGpsPorPlazo(GBR, 42)).toBe(9260);
  });
  it('plazo 60 (> 48) → precio48m (último disponible)', () => {
    expect(precioGpsPorPlazo(GBR, 60)).toBe(9260);
  });
});

describe('calcularPrecioGps', () => {
  it('clave válida → precio del proveedor según plazo', () => {
    expect(calcularPrecioGps('TECNO_LOGISTIC', 36, PROVS)).toBe(12400);
    expect(calcularPrecioGps('GBR', 24, PROVS)).toBe(6380);
  });

  it('clave null ("Sin GPS") → 0', () => {
    expect(calcularPrecioGps(null, 36, PROVS)).toBe(0);
  });

  it('clave desconocida (proveedor desactivado / histórico) → 0', () => {
    // Defensa: cotización vieja referenciando un proveedor que ya
    // no existe no debe romper, solo descartarlo.
    expect(calcularPrecioGps('DESCONOCIDO', 36, PROVS)).toBe(0);
  });

  it('plazo 30 (no estándar) con TECNO → precio36m de TECNO', () => {
    expect(calcularPrecioGps('TECNO_LOGISTIC', 30, PROVS)).toBe(12400);
  });
});
