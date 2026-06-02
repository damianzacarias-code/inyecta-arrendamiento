/**
 * types.ts — Espeja los modelos del backend (Prisma + Zod) para el flujo
 * "borrador de operación". Mantenerlos sincronizados con:
 *   - server/prisma/schema.prisma → OperationDraft / Actor / Document
 *   - server/src/routes/operationDrafts.ts → schemas Zod
 */

export type DraftStatus = 'DRAFT' | 'FINALIZED' | 'DISCARDED';
export type LeaseType = 'PURO' | 'FINANCIERO';

export type DraftActorRol = 'TITULAR' | 'AVAL' | 'REPRESENTANTE_LEGAL' | 'SOCIO';
export type ActorSubtipo = 'PFAE' | 'PM' | 'PF';

/**
 * Subset AUTO-EXTRAÍBLE por el server (INE/CSF/COMPROBANTE). El resto
 * del catálogo se sube como string libre y no se auto-extrae. `OTRO`
 * es el escape hatch para docs fuera del catálogo.
 */
export type TipoDocSoportado = 'INE' | 'CSF' | 'COMPROBANTE_DOMICILIO' | 'OTRO';

// ─── Catálogo de tipos de documento (server-driven) ─────────────────

export interface CatalogoDocItem {
  clave: string;
  etiqueta: string;
  opcional: boolean;
}

export type CatalogoSeccion =
  | 'OPERACION_PFAE'
  | 'OPERACION_PM'
  | 'SOLICITANTE_PFAE'
  | 'SOLICITANTE_PM'
  | 'REPRESENTANTE_LEGAL'
  | 'PRINCIPAL_ACCIONISTA'
  | 'AVAL_PF'
  | 'AVAL_PM'
  | 'BIEN_ARRENDADO'
  | 'FORMALIZACION';

export interface CatalogoResponse {
  catalogos: Record<CatalogoSeccion, CatalogoDocItem[]>;
}

export interface OperationDraftDoc {
  id: string;
  draftId: string;
  actorId: string | null;
  tipoDocumento: string;
  nombreArchivo: string;
  archivoPath: string;
  extraccion: Record<string, unknown> | null;
  confianzaExtraccion: number | null;
  extraidoEn: string | null;
  extraccionError: string | null;
  autoAsignado: boolean;
  createdAt: string;
}

/**
 * Shape libre del `datosConsolidados` del actor. Espeja el schema Zod
 * del backend (passthrough) — el operador puede agregar campos
 * desconocidos, pero los conocidos son tipados.
 */
export interface ActorDatosConsolidados {
  // Identidad personal
  nombre?: string | null;
  apellidoPaterno?: string | null;
  apellidoMaterno?: string | null;
  razonSocial?: string | null;
  rfc?: string | null;
  curp?: string | null;
  fechaNacimiento?: string | null;
  lugarNacimiento?: string | null;
  nacionalidad?: string | null;
  sexo?: string | null;
  // Identidad fiscal
  regimenFiscal?: string | null;
  fiel?: string | null;
  // Domicilio
  calle?: string | null;
  numExterior?: string | null;
  numInterior?: string | null;
  colonia?: string | null;
  municipio?: string | null;
  ciudad?: string | null;
  estado?: string | null;
  codigoPostal?: string | null;
  cp?: string | null;
  pais?: string | null;
  // Contacto
  email?: string | null;
  telefono?: string | null;
  celular?: string | null;
  // Estado civil
  estadoCivil?: string | null;
  regimenMatrimonial?: string | null;
  nombreConyuge?: string | null;
  // PM corporativo
  fechaConstitucion?: string | null;
  capitalSocial?: number | null;
  folioMercantil?: string | null;
  // Otros
  ingresoMensual?: number | null;
  ocupacion?: string | null;
  notas?: string | null;
  // Forward-compat
  [key: string]: unknown;
}

export interface OperationDraftActor {
  id: string;
  draftId: string;
  rol: DraftActorRol;
  subtipo: ActorSubtipo;
  nombre: string;
  orden: number;
  datosConsolidados: ActorDatosConsolidados | null;
  createdAt: string;
  updatedAt: string;
  documentos: OperationDraftDoc[];
}

export interface OperationDraft {
  id: string;
  status: DraftStatus;
  tipoOperacion: LeaseType | null;
  createdById: string;
  createdAt: string;
  updatedAt: string;
  finalizedAt: string | null;
  finalizedContractId: string | null;
}

export interface OperationDraftDetail extends OperationDraft {
  actores: OperationDraftActor[];
  docsSinAsignar: OperationDraftDoc[];
}

export interface OperationDraftListItem extends OperationDraft {
  _count: { actores: number };
}

// ─── Payload de creación / edición ──────────────────────────────────

export interface CrearActorPayload {
  rol: DraftActorRol;
  subtipo: ActorSubtipo;
  nombre: string;
}

export interface EditarActorPayload {
  nombre?: string;
  subtipo?: ActorSubtipo;
  datosConsolidados?: ActorDatosConsolidados;
}

export interface EditarDocumentoPayload {
  actorId?: string | null;
  tipoDocumento?: string;
}
