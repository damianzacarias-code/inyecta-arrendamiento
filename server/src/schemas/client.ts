// Zod schemas para Client + nested RepresentanteLegal + Shareholder.
//
// Cubre el lado "Nuevo Arrendatario" de la solicitud CNBV (página 1
// del PDF). El wizard del cliente mapea 1:1 a este shape.
//
// Reglas condicionales implementadas (todas vía superRefine):
//
//   Tipo del solicitante:
//     - PFAE → exige nombre + apellidoPaterno (+ CURP por KYC)
//     - PM   → exige razonSocial + fechaConstitucion + capitalSocial
//
//   Domicilio fiscal:
//     - Al menos calle + numExterior + colonia + municipio + estado + cp
//       (son los mínimos que acepta un comprobante de domicilio).
//
//   Representante Legal:
//     - Si PFAE: opcional (el representante puede ser el titular mismo)
//     - Si PM: obligatorio (apoderado), y si el RL es casado aplica
//       refineEstadoCivil (régimen + nombre del cónyuge)
//     - Si PM con RL: exige fechaInscripcionPoderes + folioInscripcionPoderes
//
//   Shareholders (accionistas):
//     - Solo aplica a PM (en PFAE NO se valida el array)
//     - Si se pasa lista vacía en PM → error (debe haber al menos 1)
//     - Σ porcentajes debe ser ≤ 100
//     - Al menos uno con esRepLegal=true (si se envían socios)

import { z } from 'zod';
import {
  curp,
  dateOpt,
  decimalOpt,
  domicilioFields,
  emailOpt,
  estadoCivilFields,
  optionalString,
  refineEstadoCivil,
  requiredString,
  rfc,
  zClientType,
  zGenero,
  zSituacionInstalaciones,
} from './common';

// ── RepresentanteLegal (nested bajo Client) ─────────────────────

export const representanteLegalSchema = z
  .object({
    // Identidad
    nombre: requiredString,
    apellidoPaterno: requiredString,
    apellidoMaterno: optionalString,
    rfc,
    curp,
    fiel: optionalString,
    genero: zGenero.optional(),

    // Carrera
    ocupacion: optionalString,
    anosExperiencia: z.number().int().nonnegative().optional(),

    // Nacimiento
    fechaNacimiento: dateOpt,
    lugarNacimiento: optionalString,
    nacionalidad: optionalString,

    // Estado civil
    ...estadoCivilFields,

    // Domicilio
    ...domicilioFields,
    situacionInstalaciones: zSituacionInstalaciones.optional(),
    tiempoResidenciaAnos: z.number().int().nonnegative().optional(),

    // Contacto
    telefonoFijo: optionalString,
    telefonoCelular: optionalString,
    email: emailOpt,

    // Inscripción de poderes (solo PM — lo refuerza clientSchema a nivel padre)
    fechaInscripcionPoderes: dateOpt,
    folioInscripcionPoderes: optionalString,
  })
  .superRefine(refineEstadoCivil);

export type RepresentanteLegalInput = z.infer<typeof representanteLegalSchema>;

// ── Shareholder (accionista, solo aplica a PM) ──────────────────

export const shareholderSchema = z
  .object({
    // Identidad (PF)
    nombre: requiredString,
    apellidoPaterno: requiredString,
    apellidoMaterno: optionalString,
    rfc,
    curp,
    fiel: optionalString,
    genero: zGenero.optional(),

    // PM (si el accionista es PM)
    razonSocial: optionalString,
    fechaInscripcionEscrituraConst: dateOpt,
    folioInscripcionEscrituraConst: optionalString,

    // Participación
    porcentaje: z.coerce.number().min(0, 'Porcentaje no puede ser negativo').max(100, 'Porcentaje no puede exceder 100'),
    esRepLegal: z.boolean().default(false),
    anosExperiencia: z.number().int().nonnegative().optional(),

    // Nacimiento
    fechaNacimiento: dateOpt,
    lugarNacimiento: optionalString,
    nacionalidad: optionalString,

    // Estado civil
    ...estadoCivilFields,

    // Domicilio
    ...domicilioFields,
    situacionInstalaciones: zSituacionInstalaciones.optional(),
    tiempoResidenciaAnos: z.number().int().nonnegative().optional(),

    // Contacto
    telefonoFijo: optionalString,
    telefonoCelular: optionalString,
    email: emailOpt,
  })
  .superRefine(refineEstadoCivil);

export type ShareholderInput = z.infer<typeof shareholderSchema>;

// ── Client (root) ────────────────────────────────────────────────

export const clientFieldsSchema = z.object({
  tipo: zClientType,

  // Persona física
  nombre: optionalString,
  apellidoPaterno: optionalString,
  apellidoMaterno: optionalString,
  curp,

  // Persona moral
  razonSocial: optionalString,

  // Compartidos
  rfc,
  email: emailOpt,
  telefono: optionalString,
  telefonoOficina: optionalString,

  // Identidad fiscal / actividad
  regimenFiscal: optionalString,
  fiel: optionalString,
  anosAntiguedadActividad: z.number().int().nonnegative().optional(),
  registroIMSS: optionalString,

  // Domicilio fiscal
  ...domicilioFields,

  // Domicilio de operación (opcional, puede ser igual al fiscal)
  calleOp: optionalString,
  numExteriorOp: optionalString,
  numInteriorOp: optionalString,
  coloniaOp: optionalString,
  municipioOp: optionalString,
  ciudadOp: optionalString,
  estadoOp: optionalString,
  cpOp: optionalString,

  // PM específicos
  actaConstitutiva: optionalString,
  registroPublico: optionalString,
  fechaConstitucion: dateOpt,
  capitalSocial: decimalOpt,
  folioMercantil: optionalString,
  fechaInscripcionRPC: dateOpt,

  // Metadata
  sector: optionalString,
  actividadEconomica: optionalString,

  // Relaciones anidadas (opcionales a nivel shape; refinement las valida por tipo)
  representanteLegal: representanteLegalSchema.optional(),
  socios: z.array(shareholderSchema).optional(),
});

/**
 * Schema completo con todas las reglas condicionales.
 * Usar este para POST /api/clients y PUT /api/clients/:id.
 */
export const createClientSchema = clientFieldsSchema.superRefine((data, ctx) => {
  // ── 1. Campos obligatorios por tipo ───────────────────────────
  if (data.tipo === 'PFAE') {
    if (!data.nombre) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['nombre'],
        message: 'Requerido para persona física',
      });
    }
    if (!data.apellidoPaterno) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['apellidoPaterno'],
        message: 'Requerido para persona física',
      });
    }
    if (!data.curp) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['curp'],
        message: 'CURP requerido para persona física (KYC)',
      });
    }
  }

  if (data.tipo === 'PM') {
    if (!data.razonSocial) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['razonSocial'],
        message: 'Razón social requerida para persona moral',
      });
    }
    if (!data.fechaConstitucion) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['fechaConstitucion'],
        message: 'Fecha de constitución requerida para persona moral',
      });
    }
    if (!data.capitalSocial) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['capitalSocial'],
        message: 'Capital social requerido para persona moral',
      });
    }
    if (!data.folioMercantil) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['folioMercantil'],
        message: 'Folio mercantil requerido para persona moral',
      });
    }
    if (!data.representanteLegal) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['representanteLegal'],
        message: 'Representante legal requerido para persona moral',
      });
    } else {
      if (!data.representanteLegal.fechaInscripcionPoderes) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['representanteLegal', 'fechaInscripcionPoderes'],
          message: 'Requerido: fecha de inscripción de poderes en RPC',
        });
      }
      if (!data.representanteLegal.folioInscripcionPoderes) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['representanteLegal', 'folioInscripcionPoderes'],
          message: 'Requerido: folio de inscripción de poderes en RPC',
        });
      }
    }
  }

  // ── 2. Domicilio fiscal mínimo ────────────────────────────────
  const requiredDom: Array<keyof typeof data> = [
    'calle',
    'numExterior',
    'colonia',
    'municipio',
    'estado',
    'cp',
  ];
  for (const f of requiredDom) {
    if (!data[f]) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: [f as string],
        message: `Campo de domicilio fiscal requerido: ${f as string}`,
      });
    }
  }

  // ── 3. RFC requerido (identidad fiscal obligatoria CNBV) ──────
  if (!data.rfc) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['rfc'],
      message: 'RFC requerido',
    });
  }

  // ── 4. Shareholders — solo PM, y validaciones agregadas ───────
  if (data.tipo === 'PM' && data.socios) {
    if (data.socios.length === 0) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['socios'],
        message: 'Persona moral debe declarar al menos un accionista',
      });
    } else {
      const total = data.socios.reduce((s, x) => s + Number(x.porcentaje), 0);
      if (total > 100.01) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['socios'],
          message: `Suma de porcentajes accionarios no puede exceder 100 (actual: ${total.toFixed(2)})`,
        });
      }
    }
  }

  if (data.tipo === 'PFAE' && data.socios && data.socios.length > 0) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['socios'],
      message: 'Persona física no puede tener accionistas',
    });
  }
});

export type CreateClientInput = z.infer<typeof createClientSchema>;

/**
 * Schema de update: todos los campos opcionales (partial).
 * Sin reglas condicionales porque el cliente ya existe; cada
 * PATCH individual solo actualiza lo enviado.
 *
 * Reglas de tipo (PFAE vs PM) NO se revalidan porque `tipo` no
 * debe cambiar post-creación — está filtrado en el handler.
 */
export const updateClientSchema = clientFieldsSchema.partial();

export type UpdateClientInput = z.infer<typeof updateClientSchema>;
