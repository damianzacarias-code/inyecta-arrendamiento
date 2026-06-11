/**
 * services/operationDraft.ts
 * ──────────────────────────────────────────────────────────────────
 * Lógica del flujo "borrador de operación" (Fase 1 del prototipo
 * mínimo definido el 20-05-2026 con Damián).
 *
 * El operador declara actores (titular, avales, rep legal, socios) y
 * sube documentos indiscriminadamente. Por cada doc, este servicio:
 *
 *   1. Extrae los datos con el provider configurado (Claude o Mock).
 *   2. Intenta auto-asignarlo al actor que matchee por CURP/RFC.
 *   3. Mergea los campos extraídos al `datosConsolidados` del actor.
 *
 * El merge es "último gana" — la UI muestra el valor consolidado y
 * los `extraccion` crudos de cada doc para que un futuro detector de
 * conflictos (v0.1) marque diferencias.
 *
 * NO maneja:
 *   - Finalizar el draft (crear Client + Contract reales) → v0.2.
 *   - Detectar conflictos en UI → v0.1.
 *   - Tipos de doc sin extractor (PAGARE, REPORTE_BURO, etc.) — se
 *     guardan sin extraer. Ver EXTRACT_POR_TIPO_DOC abajo.
 */
import fs from 'fs';
import path from 'path';
import prisma from '../config/db';
import { getExtractProvider, type TipoExtract } from './pdfExtract';
import { childLogger } from '../lib/logger';
import { isEnabled as cipherEnabled, decryptBuffer } from '../lib/uploadCipher';
import { validarNombreVsCurp, type IneNombreData } from './ineValidation';
import type { ActorTipo, DraftActorRol } from '@prisma/client';

const log = childLogger('operationDraft');

/**
 * Mapa tipoDocumento (catálogo del expediente) → TipoExtract (módulo
 * pdfExtract). Define qué tipos se AUTO-EXTRAEN en el borrador.
 *
 * Las claves del catálogo y del extractor divergen en dos casos:
 *   - FACTURA (catálogo) → FACTURA_BIEN (extractor)
 *   - ESTADOS_CUENTA (catálogo, plural) → ESTADO_CUENTA (extractor)
 *
 * OJO (hallazgo del architecture-reviewer 10-06-2026): la clave
 * ESTADO_CUENTA singular del catálogo (sección FORMALIZACIÓN) es el
 * estado de cuenta DEL CONTRATO que emite Inyecta — contiene la CLABE
 * de FSMP para depósitos, NO los datos bancarios del cliente. Se deja
 * deliberadamente FUERA de este mapa: extraerlo y mergearlo escribiría
 * la CLABE de FSMP como dato bancario del actor (y ese campo es
 * candidato a alimentar dispersión en v0.2). Solo el plural
 * ESTADOS_CUENTA (doc bancario de la persona) se extrae y mergea.
 *
 * Los tipos del catálogo SIN entrada aquí (PAGARE, REPORTE_BURO, etc.)
 * se guardan pero no se extraen. La validación de membresía del
 * catálogo completo vive en `expedienteCatalogs.ts` (esTipoDocEnCatalogo).
 */
const EXTRACT_POR_TIPO_DOC: Record<string, TipoExtract> = {
  INE: 'INE',
  CSF: 'CSF',
  COMPROBANTE_DOMICILIO: 'COMPROBANTE_DOMICILIO',
  FACTURA: 'FACTURA_BIEN',
  ACTA_CONSTITUTIVA: 'ACTA_CONSTITUTIVA',
  SOLICITUD: 'SOLICITUD',
  ESTADOS_CUENTA: 'ESTADO_CUENTA',
  TABLA_AMORTIZACION: 'TABLA_AMORTIZACION',
  CARATULA: 'CARATULA',
  CFDI_RENTA: 'CFDI_RENTA',
};

/** TipoExtract para un tipoDocumento del catálogo, o null si no se extrae. */
export function extractTipoParaDoc(tipoDocumento: string): TipoExtract | null {
  return EXTRACT_POR_TIPO_DOC[tipoDocumento] ?? null;
}

export function esTipoDocSoportado(tipo: string): boolean {
  return tipo in EXTRACT_POR_TIPO_DOC;
}

/**
 * Mapea el rol del actor del flujo borrador (`DraftActorRol`) al
 * `ActorTipo` del catálogo del expediente. El catálogo es la fuente de
 * verdad de qué documentos espera cada actor; el borrador usa un
 * vocabulario distinto (TITULAR/SOCIO) que aquí se traduce.
 *
 *   TITULAR             → SOLICITANTE
 *   AVAL                → AVAL
 *   REPRESENTANTE_LEGAL → REPRESENTANTE_LEGAL
 *   SOCIO               → PRINCIPAL_ACCIONISTA
 */
export function rolDraftToActorTipo(rol: DraftActorRol): ActorTipo {
  switch (rol) {
    case 'TITULAR':
      return 'SOLICITANTE';
    case 'AVAL':
      return 'AVAL';
    case 'REPRESENTANTE_LEGAL':
      return 'REPRESENTANTE_LEGAL';
    case 'SOCIO':
      return 'PRINCIPAL_ACCIONISTA';
    default: {
      const _exhaustive: never = rol;
      void _exhaustive;
      return 'SOLICITANTE';
    }
  }
}

// Subset de campos de la sección solicitante de la SOLICITUD que se
// mergea al actor (mismo vocabulario que datosConsolidados).
const CAMPOS_SOLICITANTE = [
  'nombre', 'apellidoPaterno', 'apellidoMaterno', 'razonSocial',
  'rfc', 'curp', 'fechaNacimiento', 'lugarNacimiento', 'nacionalidad', 'sexo',
  'estadoCivil', 'regimenMatrimonial',
  'email', 'telefono', 'celular',
  'fechaConstitucion', 'capitalSocial',
  'ingresoMensual', 'ocupacion',
  'calle', 'numExterior', 'numInterior', 'colonia', 'municipio',
  'ciudad', 'estado', 'codigoPostal', 'pais',
] as const;

/**
 * Mapeo de campos extraídos → campos del actor consolidado.
 *
 * Cada tipo de doc contribuye con un subset diferente:
 *   - INE: identidad personal (nombre, CURP, fechaNacimiento, sexo).
 *   - CSF: identidad fiscal (RFC, razónSocial / nombre, régimen) +
 *          domicilio fiscal.
 *   - COMPROBANTE_DOMICILIO: domicilio (calle, colonia, CP, etc.).
 *   - ACTA_CONSTITUTIVA: identidad corporativa (razón social, fecha
 *     de constitución, capital social).
 *   - ESTADO_CUENTA: datos bancarios (banco, CLABE, cuenta). Los
 *     saldos NO van al actor — son del documento, no de la persona.
 *   - SOLICITUD: aplana la sección del solicitante (PFAE o PM).
 *   - FACTURA_BIEN / TABLA_AMORTIZACION / CARATULA / CFDI_RENTA:
 *     docs de la OPERACIÓN, no de una persona → no mergean nada;
 *     la extracción queda en el documento para consumo posterior
 *     (v0.2 finalizar borrador, comparativos de competidores).
 *
 * El operador puede editar manualmente cualquier campo en la UI; el
 * merge automático es solo el punto de partida.
 *
 * Exportada para tests (lógica pura, sin Prisma).
 */
export function camposPorTipoDoc(tipo: TipoExtract, data: Record<string, unknown>): Record<string, unknown> {
  switch (tipo) {
    case 'INE':
      return pick(data, [
        'nombre',
        'apellidoPaterno',
        'apellidoMaterno',
        'curp',
        'fechaNacimiento',
        'sexo',
        'lugarNacimiento',
        'nacionalidad',
      ]);
    case 'CSF':
      return pick(data, [
        'rfc',
        'razonSocial',
        'nombre',
        'apellidoPaterno',
        'apellidoMaterno',
        'regimenFiscal',
        // Domicilio fiscal del CSF
        'calle',
        'numExterior',
        'numInterior',
        'colonia',
        'municipio',
        'ciudad',
        'estado',
        'codigoPostal',
        'cp',
      ]);
    case 'COMPROBANTE_DOMICILIO':
      return pick(data, [
        'calle',
        'numExterior',
        'numInterior',
        'colonia',
        'municipio',
        'ciudad',
        'estado',
        'codigoPostal',
        'cp',
      ]);
    case 'ACTA_CONSTITUTIVA':
      return pick(data, ['razonSocial', 'fechaConstitucion', 'capitalSocial']);
    case 'ESTADO_CUENTA':
      return pick(data, ['banco', 'clabe', 'numeroCuenta']);
    case 'SOLICITUD': {
      // La solicitud trae secciones anidadas; al actor solo va la del
      // solicitante (PFAE o PM, la que venga poblada).
      const seccion = (data.solicitantePFAE ?? data.solicitantePM) as
        | Record<string, unknown>
        | null
        | undefined;
      if (!seccion || typeof seccion !== 'object') return {};
      return pick(seccion, CAMPOS_SOLICITANTE);
    }
    case 'FACTURA_BIEN':
    case 'TABLA_AMORTIZACION':
    case 'CARATULA':
    case 'CFDI_RENTA':
      return {};
    default: {
      const _exhaustive: never = tipo;
      void _exhaustive;
      return {};
    }
  }
}

function pick(obj: Record<string, unknown>, keys: readonly string[]): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const k of keys) {
    const v = obj[k];
    if (v !== undefined && v !== null && v !== '') out[k] = v;
  }
  return out;
}

/**
 * Extrae los datos de un OperationDraftDocument y los mergea al
 * `datosConsolidados` del actor asignado (si lo hay).
 *
 * Side effects:
 *   - Update del documento con `extraccion`, `confianzaExtraccion`,
 *     `extraidoEn`, `extraccionError`.
 *   - Si el doc tiene actor asignado, update de
 *     `actor.datosConsolidados` con el merge.
 *
 * NO devuelve el resultado completo — el caller debe leer el draft
 * actualizado si lo necesita.
 */
export async function extractAndMergeDoc(documentId: string): Promise<void> {
  const doc = await prisma.operationDraftDocument.findUnique({
    where: { id: documentId },
  });
  if (!doc) throw new Error(`Documento ${documentId} no existe`);

  const tipoExtract = extractTipoParaDoc(doc.tipoDocumento);
  if (!tipoExtract) {
    log.warn({ documentId, tipo: doc.tipoDocumento }, 'tipo de documento sin extractor — se guarda sin extraer');
    return;
  }

  // Leer archivo de disco. Si está cifrado (S6) el archivo viene
  // con sufijo .enc; resolvemos al plaintext en memoria.
  const buffer = await readDocumentBuffer(doc.archivoPath);
  const provider = getExtractProvider();
  const result = await provider.extract(buffer, mimeTypeFor(doc.archivoPath), tipoExtract);

  if (!result.ok) {
    await prisma.operationDraftDocument.update({
      where: { id: documentId },
      data: {
        extraccion: result.data as never,
        confianzaExtraccion: Math.round(result.confidence * 100),
        extraidoEn: new Date(),
        extraccionError: result.error ?? 'Extracción falló',
      },
    });
    return;
  }

  // B — Validación cruzada nombre↔CURP (solo INE). Si Claude parseó mal
  // el nombre (imagen girada, convención de apellidos), las primeras
  // letras no coinciden con el CURP y lo marcamos. NO bloquea el merge:
  // poblamos los datos de todos modos (el operador corrige), pero dejamos
  // la advertencia visible y bajamos la confianza para que salte a la
  // vista en la UI. Reutilizamos `extraccionError` como campo de
  // advertencia (un campo `advertencia` dedicado queda para v0.1).
  let advertencia: string | null = null;
  if (doc.tipoDocumento === 'INE') {
    const v = validarNombreVsCurp(result.data as IneNombreData);
    if (!v.ok) {
      advertencia = v.motivo ?? null;
      log.warn({ documentId, motivo: v.motivo }, 'INE: nombre no coincide con CURP');
    }
  }

  await prisma.operationDraftDocument.update({
    where: { id: documentId },
    data: {
      extraccion: result.data as never,
      // Si hay advertencia, capamos la confianza a 50 para que la UI la
      // muestre como dudosa aunque Claude haya reportado alta confianza.
      confianzaExtraccion: advertencia
        ? Math.min(Math.round(result.confidence * 100), 50)
        : Math.round(result.confidence * 100),
      extraidoEn: new Date(),
      extraccionError: advertencia,
    },
  });

  // Si todavía no hay actor asignado, intentamos auto-match.
  let actorId = doc.actorId;
  if (!actorId) {
    actorId = await autoMatchActor(doc.draftId, tipoExtract, result.data);
    if (actorId) {
      await prisma.operationDraftDocument.update({
        where: { id: documentId },
        data: { actorId, autoAsignado: true },
      });
      log.info({ documentId, actorId }, 'auto-asignado por RFC/CURP match');
    }
  }

  if (actorId) {
    await mergeIntoActor(actorId, tipoExtract, result.data);
  }
}

/**
 * Auto-match: busca un actor del draft cuyo CURP o RFC matchee con el
 * dato extraído del doc. Estrategia:
 *   - CURP exacta (case-insensitive) gana antes que RFC.
 *   - Si el doc no trae CURP ni RFC, no se asigna.
 *   - Si el match es ambiguo (>1 actor matchea), no se asigna (el
 *     operador resuelve manualmente).
 */
async function autoMatchActor(
  draftId: string,
  _tipoDoc: TipoExtract,
  data: Record<string, unknown>,
): Promise<string | null> {
  const curp = stringValue(data.curp).toUpperCase();
  const rfc = stringValue(data.rfc).toUpperCase();
  if (!curp && !rfc) return null;

  const actores = await prisma.operationDraftActor.findMany({
    where: { draftId },
    select: { id: true, datosConsolidados: true },
  });

  const matches = actores.filter((a) => {
    const d = (a.datosConsolidados ?? {}) as Record<string, unknown>;
    const actorCurp = stringValue(d.curp).toUpperCase();
    const actorRfc = stringValue(d.rfc).toUpperCase();
    if (curp && actorCurp && curp === actorCurp) return true;
    if (rfc && actorRfc && rfc === actorRfc) return true;
    return false;
  });

  // Match ambiguo o sin match → no asignar.
  if (matches.length !== 1) return null;
  return matches[0].id;
}

/**
 * Mergea los campos pertinentes de la extracción al
 * `datosConsolidados` del actor. Estrategia "último gana": campo
 * nuevo sobreescribe campo existente. La UI puede comparar contra
 * los `extraccion` crudos de cada doc para detectar conflictos.
 */
async function mergeIntoActor(
  actorId: string,
  tipoDoc: TipoExtract,
  data: Record<string, unknown>,
): Promise<void> {
  const actor = await prisma.operationDraftActor.findUnique({
    where: { id: actorId },
    select: { datosConsolidados: true },
  });
  if (!actor) return;

  const current = (actor.datosConsolidados ?? {}) as Record<string, unknown>;
  const nuevos = camposPorTipoDoc(tipoDoc, data);
  const merged = { ...current, ...nuevos };

  await prisma.operationDraftActor.update({
    where: { id: actorId },
    data: { datosConsolidados: merged as never },
  });
}

// ─────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────

function stringValue(v: unknown): string {
  if (typeof v !== 'string') return '';
  return v.trim();
}

function mimeTypeFor(filename: string): string {
  const ext = filename.toLowerCase().split('.').pop() ?? '';
  switch (ext) {
    case 'pdf':
      return 'application/pdf';
    case 'jpg':
    case 'jpeg':
      return 'image/jpeg';
    case 'png':
      return 'image/png';
    case 'webp':
      return 'image/webp';
    default:
      return 'application/octet-stream';
  }
}

/**
 * Lee el archivo de un doc del draft.
 *
 * `archivoPath` se persiste como URL pública (`/uploads/drafts/<file>`),
 * NO como path absoluto. Aquí resolvemos al filesystem:
 *
 *   1. URL pública → path absoluto bajo `server/uploads/drafts/`.
 *   2. Si el cifrado S6 está activo, el archivo en disco lleva sufijo
 *      `.enc` (multer pasa por wrapMulter → encryptFileInPlace). En ese
 *      caso leemos el .enc y descifamos en memoria con `decryptBuffer`.
 *      Si no, leemos el plaintext directo (compat legacy y dev sin
 *      UPLOAD_MASTER_KEY).
 *
 * Throws si el archivo no existe ni en .enc ni en plaintext (el
 * caller en `extractAndMergeDoc` captura y persiste como
 * extraccionError).
 */
async function readDocumentBuffer(archivoPath: string): Promise<Buffer> {
  // Sanity check: la URL siempre empieza con /uploads/ por el publicUrl
  // helper. Resolvemos contra el dir absoluto de uploads.
  const safe = archivoPath.replace(/^\/+/, '');
  if (!safe.startsWith('uploads/')) {
    throw new Error(`archivoPath fuera de uploads/: ${archivoPath}`);
  }
  const uploadsRoot = path.resolve(__dirname, '..', '..', 'uploads');
  const relInsideUploads = safe.slice('uploads/'.length);
  const absBase = path.join(uploadsRoot, relInsideUploads);

  // Path traversal defensa: el path resuelto DEBE quedar dentro de
  // uploadsRoot. Multer ya sanitiza el filename, pero defensa en
  // profundidad nunca está de más.
  const absResolved = path.resolve(absBase);
  if (!absResolved.startsWith(uploadsRoot)) {
    throw new Error(`path traversal detectado: ${archivoPath}`);
  }

  // Preferimos el .enc (S6) si existe; cae al plaintext legacy si no.
  const encPath = `${absResolved}.enc`;
  if (cipherEnabled() && fs.existsSync(encPath)) {
    const cipherBuf = await fs.promises.readFile(encPath);
    return decryptBuffer(cipherBuf);
  }
  return fs.promises.readFile(absResolved);
}
