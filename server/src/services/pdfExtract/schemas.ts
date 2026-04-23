/**
 * schemas.ts — Schemas Zod por tipo de documento.
 *
 * Cada schema define los CAMPOS que el modelo debe extraer y sus tipos.
 * Sirve para:
 *   1. Validar que el JSON devuelto por Claude tenga la forma esperada.
 *   2. Calcular el `confidence` (qué porcentaje de campos vinieron poblados).
 *   3. Documentar al frontend qué keys puede esperar en `data`.
 *
 * Política de campos faltantes: TODOS los campos son `.nullable().optional()`
 * porque el modelo puede no encontrar un dato si está borroso o ausente. Es
 * mejor devolver null que inventar.
 */
import { z } from 'zod';
import type { TipoExtract } from './types';

// ─────────────────────────────────────────────────────────────────
// CSF — Constancia de Situación Fiscal SAT
// ─────────────────────────────────────────────────────────────────
export const csfSchema = z.object({
  rfc: z.string().nullable().optional(),
  razonSocial: z.string().nullable().optional(),    // PM o nombre completo PFAE
  curp: z.string().nullable().optional(),            // solo PF
  regimenFiscal: z.string().nullable().optional(),   // ej: "601 - General de Ley Personas Morales"
  codigoPostal: z.string().nullable().optional(),
  domicilioFiscal: z.string().nullable().optional(),
  fechaInicioOperaciones: z.string().nullable().optional(), // YYYY-MM-DD si es parseable
  estatusPadron: z.string().nullable().optional(),
});
export type CSFData = z.infer<typeof csfSchema>;

// ─────────────────────────────────────────────────────────────────
// INE — Identificación oficial (anverso)
// ─────────────────────────────────────────────────────────────────
export const ineSchema = z.object({
  nombre: z.string().nullable().optional(),
  apellidoPaterno: z.string().nullable().optional(),
  apellidoMaterno: z.string().nullable().optional(),
  curp: z.string().nullable().optional(),
  claveElector: z.string().nullable().optional(),
  fechaNacimiento: z.string().nullable().optional(), // YYYY-MM-DD
  vigencia: z.string().nullable().optional(),         // YYYY o YYYY-MM-DD
  domicilio: z.string().nullable().optional(),
  sexo: z.enum(['H', 'M']).nullable().optional(),
});
export type INEData = z.infer<typeof ineSchema>;

// ─────────────────────────────────────────────────────────────────
// Comprobante de domicilio (CFE / Telmex / agua / predial)
// ─────────────────────────────────────────────────────────────────
export const comprobanteDomicilioSchema = z.object({
  emisor: z.string().nullable().optional(),         // "CFE", "Telmex", etc.
  titular: z.string().nullable().optional(),
  direccion: z.string().nullable().optional(),
  codigoPostal: z.string().nullable().optional(),
  fechaEmision: z.string().nullable().optional(),    // YYYY-MM-DD
  periodo: z.string().nullable().optional(),         // texto del periodo facturado
});
export type ComprobanteDomicilioData = z.infer<typeof comprobanteDomicilioSchema>;

// ─────────────────────────────────────────────────────────────────
// Factura del bien — útil para autollenar Nueva Operación
// ─────────────────────────────────────────────────────────────────
export const facturaBienSchema = z.object({
  proveedor: z.string().nullable().optional(),
  rfcProveedor: z.string().nullable().optional(),
  bienDescripcion: z.string().nullable().optional(),
  bienMarca: z.string().nullable().optional(),
  bienModelo: z.string().nullable().optional(),
  bienAnio: z.number().int().nullable().optional(),
  bienNumSerie: z.string().nullable().optional(),
  valorBienSinIVA: z.number().nullable().optional(),
  ivaTrasladado: z.number().nullable().optional(),
  valorBienConIVA: z.number().nullable().optional(),
  fechaFactura: z.string().nullable().optional(),    // YYYY-MM-DD
  folio: z.string().nullable().optional(),
});
export type FacturaBienData = z.infer<typeof facturaBienSchema>;

// ─────────────────────────────────────────────────────────────────
// Acta constitutiva (PM)
// ─────────────────────────────────────────────────────────────────
export const actaConstitutivaSchema = z.object({
  razonSocial: z.string().nullable().optional(),
  fechaConstitucion: z.string().nullable().optional(), // YYYY-MM-DD
  numeroEscritura: z.string().nullable().optional(),
  notario: z.string().nullable().optional(),
  numeroNotaria: z.string().nullable().optional(),
  ciudadNotaria: z.string().nullable().optional(),
  capitalSocial: z.number().nullable().optional(),
  duracion: z.string().nullable().optional(),
  objetoSocial: z.string().nullable().optional(),
  representanteLegal: z.string().nullable().optional(),
});
export type ActaConstitutivaData = z.infer<typeof actaConstitutivaSchema>;

// ─────────────────────────────────────────────────────────────────
// Selector helper
// ─────────────────────────────────────────────────────────────────
export const SCHEMAS_BY_TIPO = {
  CSF: csfSchema,
  INE: ineSchema,
  COMPROBANTE_DOMICILIO: comprobanteDomicilioSchema,
  FACTURA_BIEN: facturaBienSchema,
  ACTA_CONSTITUTIVA: actaConstitutivaSchema,
} as const;

export function getSchemaForTipo(tipo: TipoExtract) {
  return SCHEMAS_BY_TIPO[tipo];
}

/**
 * Calcula confidence en [0, 1]: porcentaje de campos del schema cuyo
 * valor en `data` no es null/undefined/string vacío.
 */
export function computeConfidence(tipo: TipoExtract, data: Record<string, unknown>): number {
  const schema = getSchemaForTipo(tipo);
  // shape devuelve los keys del schema raíz.
  const keys = Object.keys((schema as unknown as { shape: Record<string, unknown> }).shape);
  if (keys.length === 0) return 0;
  let llenos = 0;
  for (const k of keys) {
    const v = data[k];
    if (v === null || v === undefined) continue;
    if (typeof v === 'string' && v.trim() === '') continue;
    llenos++;
  }
  return Math.min(1, llenos / keys.length);
}
