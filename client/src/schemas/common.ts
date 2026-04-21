// ⚠️  MIRROR de server/src/schemas/common.ts — mantener sincronizado.
//     Si modificas este archivo, actualiza el equivalente del servidor
//     (y sus tests en server/src/schemas/__tests__/).
// Schemas comunes — primitivas y enums compartidos por todos los
// sub-validators del flujo KYC / solicitud CNBV.
//
// Reglas de diseño:
//   1. NADA obligatorio por default. Cada sub-schema decide qué
//      campos son requeridos vía `.refine()` basado en triggers
//      (tipo PFAE vs PM, estado civil CASADO, realizaPagosEfectivo,
//      etc.). Esto permite formularios que habilitan campos según
//      condiciones sin romper la persistencia (columnas nullable).
//   2. Los strings se trimean antes de validar y los vacíos se
//      convierten a `undefined` para que las columnas opcionales
//      no guarden strings vacíos.
//   3. Fechas: se aceptan strings ISO (yyyy-MM-dd) o DateTime de JS;
//      se normalizan a Date para Prisma.
//   4. Decimales: se aceptan strings numéricas o number; se
//      convierten a string para que Prisma los meta en Decimal.

import { z } from 'zod';

// ── Primitivas reutilizables ─────────────────────────────────────

/** Trim + empty-to-undefined. Úsalo para TODO campo opcional de texto. */
export const optionalString = z
  .string()
  .trim()
  .transform((v) => (v.length === 0 ? undefined : v))
  .optional();

/** Trim + min(1). Úsalo para campos requeridos de texto. */
export const requiredString = z.string().trim().min(1, 'Campo requerido');

/** RFC mexicano válido: 12 chars (PM) o 13 chars (PF). Acepta mayúsculas. */
export const rfc = z
  .string()
  .trim()
  .toUpperCase()
  .regex(/^([A-ZÑ&]{3,4})\d{6}([A-Z\d]{3})$/, 'RFC inválido')
  .optional();

/** CURP mexicano: 18 caracteres con patrón específico. Opcional. */
export const curp = z
  .string()
  .trim()
  .toUpperCase()
  .regex(/^[A-Z]{4}\d{6}[HM][A-Z]{5}[A-Z\d]\d$/, 'CURP inválido')
  .optional();

/** Email opcional que normaliza a lowercase. */
export const emailOpt = z
  .string()
  .trim()
  .toLowerCase()
  .email('Email inválido')
  .optional()
  .or(z.literal('').transform(() => undefined));

/** Fecha aceptando string (ISO o yyyy-MM-dd) o Date; devuelve Date. */
export const dateOpt = z
  .union([z.string(), z.date()])
  .optional()
  .transform((v) => {
    if (v == null || v === '') return undefined;
    const d = v instanceof Date ? v : new Date(v);
    return isNaN(d.getTime()) ? undefined : d;
  });

/** Decimal: acepta number o string numérico, devuelve string para Prisma. */
export const decimalOpt = z
  .union([z.number(), z.string()])
  .optional()
  .refine(
    (v) => v == null || v === '' || !isNaN(Number(v)),
    { message: 'Monto inválido' }
  )
  .transform((v) => {
    if (v == null || v === '') return undefined;
    return String(v);
  });

/** CP mexicano: 5 dígitos. */
export const cpMx = z
  .string()
  .trim()
  .regex(/^\d{5}$/, 'Código postal debe ser 5 dígitos')
  .optional();

// ── Enums compartidos ───────────────────────────────────────────

export const zClientType = z.enum(['PFAE', 'PM']);
export const zEstadoCivil = z.enum(['SOLTERO', 'CASADO']);
export const zRegimenMatrimonial = z.enum(['SEPARACION_BIENES', 'SOCIEDAD_CONYUGAL']);
export const zGenero = z.enum(['M', 'F', 'OTRO', 'NO_ESPECIFICA']);
export const zSituacionInstalaciones = z.enum([
  'PROPIAS',
  'RENTADAS',
  'PAGANDOSE',
  'FAMILIARES',
  'COMODATO',
  'HIPOTECADAS',
]);
export const zMontoRango = z.enum(['HASTA_50K', 'ENTRE_50K_100K', 'MAS_100K']);
export const zFrecuenciaTrans = z.enum(['DIARIA', 'SEMANAL', 'QUINCENAL', 'MENSUAL']);
export const zNumOpsRango = z.enum(['UNO_A_TREINTA', 'TREINTAIUNO_A_CINCUENTA', 'MAS_DE_CINCUENTA']);
export const zPepTipo = z.enum(['SOLICITANTE', 'PARIENTE', 'SOCIO_ACCIONISTA']);

// ── Sub-schema: Domicilio estructurado ──────────────────────────
//
// Lo reutilizan Client, RepresentanteLegal, Shareholder y Guarantor.
// No se valida como bloque (todos los campos son opcionales a nivel
// columnar); cada consumidor aplica su propio `.refine()` para
// exigir los requeridos del flujo.
export const domicilioFields = {
  calle: optionalString,
  numExterior: optionalString,
  numInterior: optionalString,
  colonia: optionalString,
  municipio: optionalString,
  ciudad: optionalString,
  estado: optionalString,
  pais: optionalString,
  cp: cpMx,
};

// ── Sub-schema: Bloque estado civil ─────────────────────────────
//
// Regla transversal CNBV: si estadoCivil === CASADO → exigir
// regimenMatrimonial y nombreConyuge.
export const estadoCivilFields = {
  estadoCivil: zEstadoCivil.optional(),
  regimenMatrimonial: zRegimenMatrimonial.optional(),
  nombreConyuge: optionalString,
};

/**
 * Helper para aplicar la regla "si casado → requiere régimen y
 * nombre del cónyuge" a cualquier sub-schema que incluya
 * `estadoCivilFields`.
 */
export function refineEstadoCivil<
  T extends { estadoCivil?: 'SOLTERO' | 'CASADO'; regimenMatrimonial?: unknown; nombreConyuge?: unknown },
>(data: T, ctx: z.RefinementCtx) {
  if (data.estadoCivil === 'CASADO') {
    if (!data.regimenMatrimonial) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['regimenMatrimonial'],
        message: 'Requerido cuando estado civil es CASADO',
      });
    }
    if (!data.nombreConyuge) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['nombreConyuge'],
        message: 'Requerido cuando estado civil es CASADO',
      });
    }
  }
}
