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
// Solicitud de Arrendamiento — formulario completo (PFAE o PM)
// ─────────────────────────────────────────────────────────────────
// Schema ANIDADO por secciones porque el documento cubre TODO el
// expediente en una sola forma: datos del solicitante + representante
// legal (si PM) + cónyuge (si casado bajo sociedad conyugal) + perfil
// transaccional + PEP + referencias + obligados solidarios.
//
// Cada sección es .nullable().optional() — si no aplica (ej: un PM no
// tiene cónyuge), el modelo debe devolver null para la sección
// completa. Los campos dentro de cada sección también son nulables
// porque rara vez un formulario real está 100% lleno.
//
// IMPORTANTE: la forma del objeto aquí es el CONTRATO que el frontend
// va a usar para renderizar la vista de revisión y luego hacer los
// POST a /clients, /clients/:id/socios, /contracts. No romper campos
// sin actualizar también el renderer y los mappers del cliente.
// ─────────────────────────────────────────────────────────────────
const domicilioShape = {
  calle: z.string().nullable().optional(),
  numExterior: z.string().nullable().optional(),
  numInterior: z.string().nullable().optional(),
  colonia: z.string().nullable().optional(),
  municipio: z.string().nullable().optional(),
  ciudad: z.string().nullable().optional(),
  estado: z.string().nullable().optional(),
  codigoPostal: z.string().nullable().optional(),
  pais: z.string().nullable().optional(),
  tipoInmueble: z.string().nullable().optional(),     // Propio / Rentado / Hipotecado / Familiar
  antiguedadDomicilio: z.string().nullable().optional(),
};

export const solicitudSchema = z.object({
  tipoSolicitante: z.enum(['PFAE', 'PM']).nullable().optional(),

  operacion: z.object({
    tipoArrendamiento: z.enum(['PURO', 'FINANCIERO']).nullable().optional(),
    plazoMeses: z.number().int().nullable().optional(),
    moneda: z.string().nullable().optional(),          // 'MXN' / 'USD'
    destino: z.string().nullable().optional(),         // uso que le dará el solicitante al bien
  }).nullable().optional(),

  bien: z.object({
    descripcion: z.string().nullable().optional(),
    marca: z.string().nullable().optional(),
    modelo: z.string().nullable().optional(),
    anio: z.number().int().nullable().optional(),
    numSerie: z.string().nullable().optional(),
    color: z.string().nullable().optional(),
    valorConIVA: z.number().nullable().optional(),
    nuevo: z.boolean().nullable().optional(),
    proveedor: z.string().nullable().optional(),
    rfcProveedor: z.string().nullable().optional(),
  }).nullable().optional(),

  solicitantePFAE: z.object({
    nombre: z.string().nullable().optional(),
    apellidoPaterno: z.string().nullable().optional(),
    apellidoMaterno: z.string().nullable().optional(),
    rfc: z.string().nullable().optional(),
    curp: z.string().nullable().optional(),
    fechaNacimiento: z.string().nullable().optional(),     // YYYY-MM-DD
    lugarNacimiento: z.string().nullable().optional(),
    nacionalidad: z.string().nullable().optional(),
    sexo: z.enum(['H', 'M']).nullable().optional(),
    estadoCivil: z.string().nullable().optional(),
    regimenMatrimonial: z.string().nullable().optional(),  // Sociedad conyugal / Separación de bienes
    email: z.string().nullable().optional(),
    telefono: z.string().nullable().optional(),
    celular: z.string().nullable().optional(),
    actividad: z.string().nullable().optional(),
    giro: z.string().nullable().optional(),
    antiguedadNegocio: z.string().nullable().optional(),
    ingresoMensual: z.number().nullable().optional(),
    ...domicilioShape,
  }).nullable().optional(),

  solicitantePM: z.object({
    razonSocial: z.string().nullable().optional(),
    rfc: z.string().nullable().optional(),
    fechaConstitucion: z.string().nullable().optional(),   // YYYY-MM-DD
    giro: z.string().nullable().optional(),
    actividad: z.string().nullable().optional(),
    sector: z.string().nullable().optional(),
    numeroEscritura: z.string().nullable().optional(),
    numeroNotaria: z.string().nullable().optional(),
    notario: z.string().nullable().optional(),
    ciudadNotaria: z.string().nullable().optional(),
    capitalSocial: z.number().nullable().optional(),
    email: z.string().nullable().optional(),
    telefono: z.string().nullable().optional(),
    ingresosAnuales: z.number().nullable().optional(),
    numEmpleados: z.number().int().nullable().optional(),
    ...domicilioShape,
  }).nullable().optional(),

  representanteLegal: z.object({
    nombre: z.string().nullable().optional(),
    apellidoPaterno: z.string().nullable().optional(),
    apellidoMaterno: z.string().nullable().optional(),
    rfc: z.string().nullable().optional(),
    curp: z.string().nullable().optional(),
    cargo: z.string().nullable().optional(),
    email: z.string().nullable().optional(),
    telefono: z.string().nullable().optional(),
    numeroEscrituraPoder: z.string().nullable().optional(),
    fechaEscrituraPoder: z.string().nullable().optional(),
    numeroNotariaPoder: z.string().nullable().optional(),
    notarioPoder: z.string().nullable().optional(),
  }).nullable().optional(),

  conyuge: z.object({
    nombre: z.string().nullable().optional(),
    apellidoPaterno: z.string().nullable().optional(),
    apellidoMaterno: z.string().nullable().optional(),
    rfc: z.string().nullable().optional(),
    curp: z.string().nullable().optional(),
    ocupacion: z.string().nullable().optional(),
    telefono: z.string().nullable().optional(),
  }).nullable().optional(),

  perfilTransaccional: z.object({
    montoMensualOperaciones: z.number().nullable().optional(),
    numeroOperacionesMensuales: z.number().int().nullable().optional(),
    origenRecursos: z.string().nullable().optional(),
    destinoRecursos: z.string().nullable().optional(),
    operaComercioExterior: z.boolean().nullable().optional(),
    paisesComercioExterior: z.string().nullable().optional(),
    realizaDivisas: z.boolean().nullable().optional(),
    realizaTransferenciasInternacionales: z.boolean().nullable().optional(),
  }).nullable().optional(),

  pep: z.object({
    esPEP: z.boolean().nullable().optional(),
    cargoPEP: z.string().nullable().optional(),
    periodoPEP: z.string().nullable().optional(),
    familiarPEP: z.boolean().nullable().optional(),
    nombreFamiliarPEP: z.string().nullable().optional(),
    parentescoPEP: z.string().nullable().optional(),
    cargoFamiliarPEP: z.string().nullable().optional(),
  }).nullable().optional(),

  referenciasBancarias: z.array(z.object({
    banco: z.string().nullable().optional(),
    tipoCuenta: z.string().nullable().optional(),          // Cheques / Inversión / Crédito
    numeroCuenta: z.string().nullable().optional(),
    antiguedad: z.string().nullable().optional(),
  })).nullable().optional(),

  referenciasComerciales: z.array(z.object({
    nombre: z.string().nullable().optional(),
    giro: z.string().nullable().optional(),
    telefono: z.string().nullable().optional(),
    email: z.string().nullable().optional(),
    antiguedad: z.string().nullable().optional(),
    lineaCredito: z.number().nullable().optional(),
  })).nullable().optional(),

  obligadosSolidarios: z.array(z.object({
    tipo: z.enum(['PFAE', 'PM', 'PF']).nullable().optional(),
    nombre: z.string().nullable().optional(),
    apellidoPaterno: z.string().nullable().optional(),
    apellidoMaterno: z.string().nullable().optional(),
    razonSocial: z.string().nullable().optional(),
    rfc: z.string().nullable().optional(),
    curp: z.string().nullable().optional(),
    fechaNacimiento: z.string().nullable().optional(),
    email: z.string().nullable().optional(),
    telefono: z.string().nullable().optional(),
    relacion: z.string().nullable().optional(),             // relación con el solicitante
    ingresoMensual: z.number().nullable().optional(),
    ocupacion: z.string().nullable().optional(),
  })).nullable().optional(),
});
export type SolicitudData = z.infer<typeof solicitudSchema>;

// ─────────────────────────────────────────────────────────────────
// Selector helper
// ─────────────────────────────────────────────────────────────────
export const SCHEMAS_BY_TIPO = {
  CSF: csfSchema,
  INE: ineSchema,
  COMPROBANTE_DOMICILIO: comprobanteDomicilioSchema,
  FACTURA_BIEN: facturaBienSchema,
  ACTA_CONSTITUTIVA: actaConstitutivaSchema,
  SOLICITUD: solicitudSchema,
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
