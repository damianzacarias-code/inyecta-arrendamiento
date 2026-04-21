// Tests del schema de Guarantor (obligado solidario / aval).
//
// Cubre:
//  - PF: nombre + apellidoPaterno requeridos
//  - PM (si razonSocial): exige representante + inscripciones RPC
//  - Estado civil CASADO → régimen + cónyuge
//  - Al menos un teléfono (fijo o celular)

import { describe, expect, it } from 'vitest';
import { createGuarantorSchema } from '../guarantor';

// ── Guarantor persona física ───────────────────────────────────

describe('createGuarantorSchema — PF', () => {
  it('acepta PF mínimo con nombre, apellido y teléfono', () => {
    const result = createGuarantorSchema.safeParse({
      nombre: 'Carlos',
      apellidoPaterno: 'Ramírez',
      telefonoCelular: '5551234567',
    });
    if (!result.success) console.error(result.error.issues);
    expect(result.success).toBe(true);
  });

  it('rechaza PF sin nombre', () => {
    const result = createGuarantorSchema.safeParse({
      apellidoPaterno: 'Ramírez',
      telefonoCelular: '5551234567',
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues.some((i) => i.path.includes('nombre'))).toBe(true);
    }
  });

  it('rechaza PF sin apellido paterno', () => {
    const result = createGuarantorSchema.safeParse({
      nombre: 'Carlos',
      telefonoCelular: '5551234567',
    });
    expect(result.success).toBe(false);
  });

  it('rechaza PF sin ningún teléfono', () => {
    const result = createGuarantorSchema.safeParse({
      nombre: 'Carlos',
      apellidoPaterno: 'Ramírez',
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(
        result.error.issues.some((i) =>
          i.message.toLowerCase().includes('teléfono'),
        ),
      ).toBe(true);
    }
  });

  it('acepta PF con solo teléfono fijo', () => {
    const result = createGuarantorSchema.safeParse({
      nombre: 'Carlos',
      apellidoPaterno: 'Ramírez',
      telefonoFijo: '5544556677',
    });
    expect(result.success).toBe(true);
  });
});

// ── Guarantor persona moral (si tiene razonSocial) ─────────────

const basePMAval = {
  razonSocial: 'Aval Empresarial S.A. de C.V.',
  representanteNombre: 'Ana',
  representanteApellidoPaterno: 'Martínez',
  fechaInscripcionEscrituraConst: '2018-06-01',
  folioInscripcionEscrituraConst: 'ESC-1234',
  fechaInscripcionPoderes: '2019-03-15',
  folioInscripcionPoderes: 'POD-5678',
  telefonoFijo: '5544556677',
};

describe('createGuarantorSchema — PM', () => {
  it('acepta PM completo', () => {
    const result = createGuarantorSchema.safeParse(basePMAval);
    if (!result.success) console.error(result.error.issues);
    expect(result.success).toBe(true);
  });

  it('rechaza PM sin representante legal', () => {
    const result = createGuarantorSchema.safeParse({
      ...basePMAval,
      representanteNombre: undefined,
    });
    expect(result.success).toBe(false);
  });

  it('rechaza PM sin fecha de inscripción de poderes', () => {
    const result = createGuarantorSchema.safeParse({
      ...basePMAval,
      fechaInscripcionPoderes: undefined,
    });
    expect(result.success).toBe(false);
  });

  it('rechaza PM sin folio de inscripción de escritura constitutiva', () => {
    const result = createGuarantorSchema.safeParse({
      ...basePMAval,
      folioInscripcionEscrituraConst: undefined,
    });
    expect(result.success).toBe(false);
  });
});

// ── Estado civil ────────────────────────────────────────────────

describe('createGuarantorSchema — estado civil', () => {
  it('acepta SOLTERO sin régimen', () => {
    const result = createGuarantorSchema.safeParse({
      nombre: 'Carlos',
      apellidoPaterno: 'Ramírez',
      telefonoCelular: '5551234567',
      estadoCivil: 'SOLTERO',
    });
    expect(result.success).toBe(true);
  });

  it('rechaza CASADO sin régimen ni cónyuge', () => {
    const result = createGuarantorSchema.safeParse({
      nombre: 'Carlos',
      apellidoPaterno: 'Ramírez',
      telefonoCelular: '5551234567',
      estadoCivil: 'CASADO',
    });
    expect(result.success).toBe(false);
  });

  it('acepta CASADO completo', () => {
    const result = createGuarantorSchema.safeParse({
      nombre: 'Carlos',
      apellidoPaterno: 'Ramírez',
      telefonoCelular: '5551234567',
      estadoCivil: 'CASADO',
      regimenMatrimonial: 'SEPARACION_BIENES',
      nombreConyuge: 'Laura',
    });
    expect(result.success).toBe(true);
  });
});
