// ⚠️  MIRROR de server/src/schemas/guarantor.ts — mantener sincronizado.
//     Si modificas este archivo, actualiza el equivalente del servidor
//     (y sus tests en server/src/schemas/__tests__/).
// Zod schema para Guarantor (obligado solidario / aval).
//
// El PDF CNBV contempla hasta 3 obligados solidarios por operación.
// En el modelo actual:
//   - Guarantor pertenece a Client (reutilizable entre operaciones
//     del mismo titular)
//   - ContractGuarantor linkea un Guarantor a un Contract con un
//     `orden` (1, 2 ó 3)
//
// Condicionales:
//   - Si razonSocial está presente → es PM; exige representante
//     legal + inscripciones (escritura y poderes)
//   - Si estadoCivil=CASADO → exige régimen + nombreConyuge
//   - Al menos teléfono fijo O celular
//   - Identidad básica mínima:
//       PF: nombre + apellidoPaterno
//       PM: razonSocial + representanteNombre + representanteApellidoPaterno

import { z } from 'zod';
import {
  curp,
  dateOpt,
  domicilioFields,
  emailOpt,
  estadoCivilFields,
  optionalString,
  refineEstadoCivil,
  requiredString,
  rfc,
  zGenero,
} from './common';

export const guarantorFieldsSchema = z.object({
  // Identidad básica (PF por default; si razonSocial presente → PM)
  nombre: optionalString,
  apellidoPaterno: optionalString,
  apellidoMaterno: optionalString,
  rfc,
  curp,
  fiel: optionalString,
  genero: zGenero.optional(),
  relacion: optionalString,

  // PM (si el obligado solidario es una empresa)
  razonSocial: optionalString,
  representanteNombre: optionalString,
  representanteApellidoPaterno: optionalString,
  representanteApellidoMaterno: optionalString,
  representanteRfc: rfc,
  fechaInscripcionEscrituraConst: dateOpt,
  folioInscripcionEscrituraConst: optionalString,
  fechaInscripcionPoderes: dateOpt,
  folioInscripcionPoderes: optionalString,

  // Estado civil
  ...estadoCivilFields,

  // Nacimiento / nacionalidad
  fechaNacimiento: dateOpt,
  lugarNacimiento: optionalString,
  nacionalidad: optionalString,

  // Domicilio
  ...domicilioFields,

  // Contacto
  telefonoFijo: optionalString,
  telefonoCelular: optionalString,
  email: emailOpt,
});

export const createGuarantorSchema = guarantorFieldsSchema.superRefine((data, ctx) => {
  refineEstadoCivil(data, ctx);

  // ── Detectar tipo implícito por presencia de razonSocial ──────
  const esPM = !!data.razonSocial;

  if (esPM) {
    // Obligado solidario PM: exige representante legal + inscripciones
    if (!data.representanteNombre) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['representanteNombre'],
        message: 'Requerido cuando el obligado solidario es persona moral',
      });
    }
    if (!data.representanteApellidoPaterno) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['representanteApellidoPaterno'],
        message: 'Requerido cuando el obligado solidario es persona moral',
      });
    }
    if (!data.fechaInscripcionEscrituraConst) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['fechaInscripcionEscrituraConst'],
        message: 'Requerido: fecha de inscripción de escritura constitutiva',
      });
    }
    if (!data.folioInscripcionEscrituraConst) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['folioInscripcionEscrituraConst'],
        message: 'Requerido: folio de inscripción de escritura constitutiva',
      });
    }
    if (!data.fechaInscripcionPoderes) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['fechaInscripcionPoderes'],
        message: 'Requerido: fecha de inscripción de poderes',
      });
    }
    if (!data.folioInscripcionPoderes) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['folioInscripcionPoderes'],
        message: 'Requerido: folio de inscripción de poderes',
      });
    }
  } else {
    // Obligado solidario PF
    if (!data.nombre) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['nombre'],
        message: 'Requerido',
      });
    }
    if (!data.apellidoPaterno) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['apellidoPaterno'],
        message: 'Requerido',
      });
    }
  }

  // Al menos un teléfono
  if (!data.telefonoFijo && !data.telefonoCelular) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['telefonoCelular'],
      message: 'Al menos un teléfono (fijo o celular) es requerido',
    });
  }
});

export type CreateGuarantorInput = z.infer<typeof createGuarantorSchema>;

export const updateGuarantorSchema = guarantorFieldsSchema.partial();
export type UpdateGuarantorInput = z.infer<typeof updateGuarantorSchema>;

// ── Link Guarantor ↔ Contract con orden ──────────────────────────

export const linkContractGuarantorSchema = z.object({
  guarantorId: requiredString,
  orden: z.number().int().min(1).max(3),
});

export type LinkContractGuarantorInput = z.infer<typeof linkContractGuarantorSchema>;
