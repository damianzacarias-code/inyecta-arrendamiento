// Tests de las reglas condicionales del schema de Cliente (KYC CNBV).
//
// El schema vive en src/schemas/client.ts y protege los endpoints
// POST /api/clients y PUT /api/clients/:id. Valida que el wizard de
// "Nuevo Arrendatario" envíe los campos mínimos por tipo (PFAE vs
// PM), estado civil (CASADO → cónyuge obligatorio), domicilio,
// accionistas y representante legal.

import { describe, expect, it } from 'vitest';
import { createClientSchema, updateClientSchema } from '../client';

// ── Helpers ──────────────────────────────────────────────────────

/** Domicilio fiscal mínimo aceptado por el schema. */
const baseDomicilio = {
  calle: 'Av. Reforma',
  numExterior: '100',
  colonia: 'Centro',
  municipio: 'Cuauhtémoc',
  estado: 'CDMX',
  cp: '06000',
};

/** PFAE base con todos los requeridos. */
const basePFAE = {
  tipo: 'PFAE' as const,
  nombre: 'Juan',
  apellidoPaterno: 'Pérez',
  apellidoMaterno: 'López',
  rfc: 'PELJ800101ABC',
  curp: 'PELJ800101HDFRPL08',
  ...baseDomicilio,
};

/** Representante legal base válido para PM. */
const baseRepresentanteLegal = {
  nombre: 'María',
  apellidoPaterno: 'García',
  estadoCivil: 'SOLTERO' as const,
  fechaInscripcionPoderes: '2020-05-01',
  folioInscripcionPoderes: 'P-12345',
};

/** PM base con todos los requeridos. */
const basePM = {
  tipo: 'PM' as const,
  razonSocial: 'Empresa Ejemplo S.A. de C.V.',
  rfc: 'EEM150101AB7',
  fechaConstitucion: '2015-01-01',
  capitalSocial: '500000',
  folioMercantil: 'M-98765',
  representanteLegal: baseRepresentanteLegal,
  ...baseDomicilio,
};

// ── PFAE ────────────────────────────────────────────────────────

describe('createClientSchema — PFAE', () => {
  it('acepta un PFAE completo', () => {
    const result = createClientSchema.safeParse(basePFAE);
    if (!result.success) console.error(result.error.issues);
    expect(result.success).toBe(true);
  });

  it('rechaza PFAE sin nombre', () => {
    const result = createClientSchema.safeParse({ ...basePFAE, nombre: undefined });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues.some((i) => i.path.includes('nombre'))).toBe(true);
    }
  });

  it('rechaza PFAE sin apellido paterno', () => {
    const result = createClientSchema.safeParse({ ...basePFAE, apellidoPaterno: undefined });
    expect(result.success).toBe(false);
  });

  it('rechaza PFAE sin CURP (requisito KYC)', () => {
    const result = createClientSchema.safeParse({ ...basePFAE, curp: undefined });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues.some((i) => i.path.includes('curp'))).toBe(true);
    }
  });

  it('rechaza CURP con formato inválido', () => {
    const result = createClientSchema.safeParse({ ...basePFAE, curp: 'ABC123' });
    expect(result.success).toBe(false);
  });

  it('rechaza PFAE con socios (los socios son solo PM)', () => {
    const result = createClientSchema.safeParse({
      ...basePFAE,
      socios: [
        {
          nombre: 'Pedro',
          apellidoPaterno: 'Sánchez',
          porcentaje: 100,
        },
      ],
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues.some((i) => i.path.includes('socios'))).toBe(true);
    }
  });
});

// ── PM ──────────────────────────────────────────────────────────

describe('createClientSchema — PM', () => {
  it('acepta un PM completo con representante legal', () => {
    const result = createClientSchema.safeParse(basePM);
    if (!result.success) console.error(result.error.issues);
    expect(result.success).toBe(true);
  });

  it('rechaza PM sin razón social', () => {
    const result = createClientSchema.safeParse({ ...basePM, razonSocial: undefined });
    expect(result.success).toBe(false);
  });

  it('rechaza PM sin fecha de constitución', () => {
    const result = createClientSchema.safeParse({ ...basePM, fechaConstitucion: undefined });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues.some((i) => i.path.includes('fechaConstitucion'))).toBe(true);
    }
  });

  it('rechaza PM sin capital social', () => {
    const result = createClientSchema.safeParse({ ...basePM, capitalSocial: undefined });
    expect(result.success).toBe(false);
  });

  it('rechaza PM sin folio mercantil', () => {
    const result = createClientSchema.safeParse({ ...basePM, folioMercantil: undefined });
    expect(result.success).toBe(false);
  });

  it('rechaza PM sin representante legal', () => {
    const result = createClientSchema.safeParse({ ...basePM, representanteLegal: undefined });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues.some((i) => i.path.includes('representanteLegal'))).toBe(true);
    }
  });

  it('rechaza RL de PM sin inscripción de poderes', () => {
    const result = createClientSchema.safeParse({
      ...basePM,
      representanteLegal: { ...baseRepresentanteLegal, folioInscripcionPoderes: undefined },
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(
        result.error.issues.some((i) => i.path.join('.') === 'representanteLegal.folioInscripcionPoderes'),
      ).toBe(true);
    }
  });

  it('acepta PM con socios sumando exactamente 100%', () => {
    const result = createClientSchema.safeParse({
      ...basePM,
      socios: [
        { nombre: 'Pedro', apellidoPaterno: 'Sánchez', porcentaje: 60, esRepLegal: true },
        { nombre: 'Ana', apellidoPaterno: 'Ruiz', porcentaje: 40 },
      ],
    });
    if (!result.success) console.error(result.error.issues);
    expect(result.success).toBe(true);
  });

  it('rechaza PM con socios sumando más de 100%', () => {
    const result = createClientSchema.safeParse({
      ...basePM,
      socios: [
        { nombre: 'Pedro', apellidoPaterno: 'Sánchez', porcentaje: 70, esRepLegal: true },
        { nombre: 'Ana', apellidoPaterno: 'Ruiz', porcentaje: 45 },
      ],
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(
        result.error.issues.some(
          (i) => i.path.includes('socios') && i.message.includes('100'),
        ),
      ).toBe(true);
    }
  });

  it('rechaza PM con lista de socios vacía', () => {
    const result = createClientSchema.safeParse({
      ...basePM,
      socios: [],
    });
    expect(result.success).toBe(false);
  });
});

// ── Estado civil (regla transversal CASADO → cónyuge) ──────────

describe('estado civil CASADO', () => {
  it('RL casado sin régimen → error', () => {
    const result = createClientSchema.safeParse({
      ...basePM,
      representanteLegal: {
        ...baseRepresentanteLegal,
        estadoCivil: 'CASADO',
        nombreConyuge: 'Alguien',
        // regimenMatrimonial omitido
      },
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(
        result.error.issues.some(
          (i) => i.path.join('.') === 'representanteLegal.regimenMatrimonial',
        ),
      ).toBe(true);
    }
  });

  it('RL casado sin nombre del cónyuge → error', () => {
    const result = createClientSchema.safeParse({
      ...basePM,
      representanteLegal: {
        ...baseRepresentanteLegal,
        estadoCivil: 'CASADO',
        regimenMatrimonial: 'SEPARACION_BIENES',
        // nombreConyuge omitido
      },
    });
    expect(result.success).toBe(false);
  });

  it('RL casado completo → ok', () => {
    const result = createClientSchema.safeParse({
      ...basePM,
      representanteLegal: {
        ...baseRepresentanteLegal,
        estadoCivil: 'CASADO',
        regimenMatrimonial: 'SOCIEDAD_CONYUGAL',
        nombreConyuge: 'Carmen López',
      },
    });
    if (!result.success) console.error(result.error.issues);
    expect(result.success).toBe(true);
  });

  it('RL soltero no requiere régimen ni cónyuge', () => {
    const result = createClientSchema.safeParse({
      ...basePM,
      representanteLegal: { ...baseRepresentanteLegal, estadoCivil: 'SOLTERO' },
    });
    expect(result.success).toBe(true);
  });
});

// ── Domicilio fiscal mínimo ────────────────────────────────────

describe('domicilio fiscal', () => {
  it('rechaza falta de calle', () => {
    const result = createClientSchema.safeParse({ ...basePFAE, calle: undefined });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues.some((i) => i.path.includes('calle'))).toBe(true);
    }
  });

  it('rechaza CP inválido (no 5 dígitos)', () => {
    const result = createClientSchema.safeParse({ ...basePFAE, cp: '0600' });
    expect(result.success).toBe(false);
  });
});

// ── RFC requerido ───────────────────────────────────────────────

describe('RFC', () => {
  it('rechaza falta de RFC', () => {
    const result = createClientSchema.safeParse({ ...basePFAE, rfc: undefined });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues.some((i) => i.path.includes('rfc'))).toBe(true);
    }
  });

  it('rechaza RFC con formato inválido', () => {
    const result = createClientSchema.safeParse({ ...basePFAE, rfc: 'XX123' });
    expect(result.success).toBe(false);
  });

  it('normaliza RFC a mayúsculas', () => {
    const result = createClientSchema.safeParse({ ...basePFAE, rfc: 'pelj800101abc' });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.rfc).toBe('PELJ800101ABC');
    }
  });
});

// ── Update schema (partial, sin reglas condicionales) ──────────

describe('updateClientSchema', () => {
  it('acepta un patch parcial de un solo campo', () => {
    const result = updateClientSchema.safeParse({ telefono: '5551234567' });
    expect(result.success).toBe(true);
  });

  it('acepta un patch vacío', () => {
    const result = updateClientSchema.safeParse({});
    expect(result.success).toBe(true);
  });
});
