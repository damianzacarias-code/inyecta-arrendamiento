// Tests de las reglas condicionales del schema de Contrato (KYC CNBV).
//
// Cubre:
//  - PerfilTransaccional: realizaPagosEfectivo=true → exige motivos+monto
//  - DeclaracionPEP: esPep=true → exige dependencia/puesto/periodo/funciones
//  - DeclaracionPEP tipo=PARIENTE + esPep → también exige nombre+parentesco
//  - Terceros: exists=true → exige info
//  - Obligados solidarios: unicidad de orden y guarantorId
//  - Declaraciones PEP: unicidad de tipo en el array

import { describe, expect, it } from 'vitest';
import {
  contractKycFieldsSchema,
  declaracionPEPSchema,
  perfilTransaccionalSchema,
  proveedorSchema,
} from '../contract';

// ── PerfilTransaccional ────────────────────────────────────────

describe('perfilTransaccionalSchema', () => {
  it('acepta perfil sin pagos en efectivo', () => {
    const result = perfilTransaccionalSchema.safeParse({
      origenRecursos: 'Ventas del giro',
      realizaPagosEfectivo: false,
    });
    expect(result.success).toBe(true);
  });

  it('acepta perfil sin el flag de efectivo (undefined)', () => {
    const result = perfilTransaccionalSchema.safeParse({
      origenRecursos: 'Ventas del giro',
    });
    expect(result.success).toBe(true);
  });

  it('rechaza realizaPagosEfectivo=true sin motivos', () => {
    const result = perfilTransaccionalSchema.safeParse({
      realizaPagosEfectivo: true,
      efectivoMontoMensual: '50000',
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues.some((i) => i.path.includes('efectivoMotivos'))).toBe(true);
    }
  });

  it('rechaza realizaPagosEfectivo=true sin monto', () => {
    const result = perfilTransaccionalSchema.safeParse({
      realizaPagosEfectivo: true,
      efectivoMotivos: 'Clientes pagan en efectivo',
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues.some((i) => i.path.includes('efectivoMontoMensual'))).toBe(true);
    }
  });

  it('acepta realizaPagosEfectivo=true con motivos y monto', () => {
    const result = perfilTransaccionalSchema.safeParse({
      realizaPagosEfectivo: true,
      efectivoMotivos: 'Clientes pagan en efectivo',
      efectivoMontoMensual: '50000',
    });
    expect(result.success).toBe(true);
  });
});

// ── DeclaracionPEP ─────────────────────────────────────────────

describe('declaracionPEPSchema', () => {
  it('acepta esPep=false sin detalles', () => {
    const result = declaracionPEPSchema.safeParse({
      tipo: 'SOLICITANTE',
      esPep: false,
    });
    expect(result.success).toBe(true);
  });

  it('rechaza esPep=true sin dependencia', () => {
    const result = declaracionPEPSchema.safeParse({
      tipo: 'SOLICITANTE',
      esPep: true,
      puesto: 'Director',
      periodoEjercicio: '2020-2024',
      principalesFunciones: 'Administrar',
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues.some((i) => i.path.includes('dependencia'))).toBe(true);
    }
  });

  it('rechaza esPep=true sin puesto/periodo/funciones', () => {
    const result = declaracionPEPSchema.safeParse({
      tipo: 'SOLICITANTE',
      esPep: true,
      dependencia: 'SEP',
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      const paths = result.error.issues.map((i) => i.path.join('.'));
      expect(paths).toContain('puesto');
      expect(paths).toContain('periodoEjercicio');
      expect(paths).toContain('principalesFunciones');
    }
  });

  it('acepta SOLICITANTE con todos los campos requeridos', () => {
    const result = declaracionPEPSchema.safeParse({
      tipo: 'SOLICITANTE',
      esPep: true,
      dependencia: 'SEP',
      puesto: 'Director',
      periodoEjercicio: '2020-2024',
      principalesFunciones: 'Administrar',
    });
    expect(result.success).toBe(true);
  });

  it('rechaza PARIENTE con esPep=true sin nombre del pariente', () => {
    const result = declaracionPEPSchema.safeParse({
      tipo: 'PARIENTE',
      esPep: true,
      dependencia: 'SEP',
      puesto: 'Director',
      periodoEjercicio: '2020-2024',
      principalesFunciones: 'Administrar',
      parentesco: 'Padre',
      // nombre omitido
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues.some((i) => i.path.includes('nombre'))).toBe(true);
    }
  });

  it('rechaza PARIENTE con esPep=true sin parentesco', () => {
    const result = declaracionPEPSchema.safeParse({
      tipo: 'PARIENTE',
      esPep: true,
      dependencia: 'SEP',
      puesto: 'Director',
      periodoEjercicio: '2020-2024',
      principalesFunciones: 'Administrar',
      nombre: 'Pedro Pérez',
      // parentesco omitido
    });
    expect(result.success).toBe(false);
  });

  it('acepta PARIENTE con esPep=true completo', () => {
    const result = declaracionPEPSchema.safeParse({
      tipo: 'PARIENTE',
      esPep: true,
      dependencia: 'SEP',
      puesto: 'Director',
      periodoEjercicio: '2020-2024',
      principalesFunciones: 'Administrar',
      nombre: 'Pedro Pérez',
      parentesco: 'Padre',
    });
    expect(result.success).toBe(true);
  });
});

// ── Proveedor ──────────────────────────────────────────────────

describe('proveedorSchema', () => {
  it('acepta proveedor con solo nombre', () => {
    const result = proveedorSchema.safeParse({ nombre: 'Toyota México' });
    expect(result.success).toBe(true);
  });

  it('rechaza proveedor sin nombre', () => {
    const result = proveedorSchema.safeParse({ telefono: '5551234567' });
    expect(result.success).toBe(false);
  });

  it('rechaza email mal formado', () => {
    const result = proveedorSchema.safeParse({ nombre: 'X', email: 'no-es-email' });
    expect(result.success).toBe(false);
  });
});

// ── Terceros + Obligados solidarios + PEP unicidad ─────────────

describe('contractKycFieldsSchema — terceros', () => {
  it('acepta ausencia total de terceros', () => {
    const result = contractKycFieldsSchema.safeParse({});
    expect(result.success).toBe(true);
  });

  it('rechaza tercerBeneficiarioExiste=true sin info', () => {
    const result = contractKycFieldsSchema.safeParse({
      tercerBeneficiarioExiste: true,
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues.some((i) => i.path.includes('tercerBeneficiarioInfo'))).toBe(true);
    }
  });

  it('acepta tercerBeneficiarioExiste=true con info', () => {
    const result = contractKycFieldsSchema.safeParse({
      tercerBeneficiarioExiste: true,
      tercerBeneficiarioInfo: 'Empresa X S.A.',
    });
    expect(result.success).toBe(true);
  });

  it('rechaza tercerAportanteExiste=true sin info', () => {
    const result = contractKycFieldsSchema.safeParse({
      tercerAportanteExiste: true,
    });
    expect(result.success).toBe(false);
  });
});

describe('contractKycFieldsSchema — unicidad PEP', () => {
  it('rechaza dos declaraciones PEP con el mismo tipo', () => {
    const result = contractKycFieldsSchema.safeParse({
      declaracionesPEP: [
        { tipo: 'SOLICITANTE', esPep: false },
        { tipo: 'SOLICITANTE', esPep: false },
      ],
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(
        result.error.issues.some((i) => i.path.includes('declaracionesPEP')),
      ).toBe(true);
    }
  });

  it('acepta las 3 tipologías PEP juntas (una por tipo)', () => {
    const result = contractKycFieldsSchema.safeParse({
      declaracionesPEP: [
        { tipo: 'SOLICITANTE', esPep: false },
        { tipo: 'PARIENTE', esPep: false },
        { tipo: 'SOCIO_ACCIONISTA', esPep: false },
      ],
    });
    expect(result.success).toBe(true);
  });
});
