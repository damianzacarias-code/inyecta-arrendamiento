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
 *   - Tipos de doc más allá de INE / CSF / COMPROBANTE_DOMICILIO.
 */
import fs from 'fs';
import path from 'path';
import prisma from '../config/db';
import { getExtractProvider, type TipoExtract } from './pdfExtract';
import { childLogger } from '../lib/logger';
import { isEnabled as cipherEnabled, decryptBuffer } from '../lib/uploadCipher';

const log = childLogger('operationDraft');

/** Tipos de documento soportados por el prototipo v0. */
export const TIPOS_DOC_DRAFT = ['INE', 'CSF', 'COMPROBANTE_DOMICILIO'] as const;
export type TipoDocDraft = (typeof TIPOS_DOC_DRAFT)[number];

export function esTipoDocSoportado(tipo: string): tipo is TipoDocDraft {
  return (TIPOS_DOC_DRAFT as readonly string[]).includes(tipo);
}

/**
 * Mapeo de campos extraídos → campos del actor consolidado.
 *
 * Cada tipo de doc contribuye con un subset diferente:
 *   - INE: identidad personal (nombre, CURP, fechaNacimiento, sexo).
 *   - CSF: identidad fiscal (RFC, razónSocial / nombre, régimen) +
 *          domicilio fiscal.
 *   - COMPROBANTE_DOMICILIO: domicilio (calle, colonia, CP, etc.).
 *
 * El operador puede editar manualmente cualquier campo en la UI; el
 * merge automático es solo el punto de partida.
 */
function camposPorTipoDoc(tipo: TipoDocDraft, data: Record<string, unknown>): Record<string, unknown> {
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

  if (!esTipoDocSoportado(doc.tipoDocumento)) {
    log.warn({ documentId, tipo: doc.tipoDocumento }, 'tipo de documento no soportado en v0');
    return;
  }

  // Leer archivo de disco. Si está cifrado (S6) el archivo viene
  // con sufijo .enc; resolvemos al plaintext en memoria.
  const buffer = await readDocumentBuffer(doc.archivoPath);
  const provider = getExtractProvider();
  const result = await provider.extract(buffer, mimeTypeFor(doc.archivoPath), doc.tipoDocumento as TipoExtract);

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

  await prisma.operationDraftDocument.update({
    where: { id: documentId },
    data: {
      extraccion: result.data as never,
      confianzaExtraccion: Math.round(result.confidence * 100),
      extraidoEn: new Date(),
      extraccionError: null,
    },
  });

  // Si todavía no hay actor asignado, intentamos auto-match.
  let actorId = doc.actorId;
  if (!actorId) {
    actorId = await autoMatchActor(doc.draftId, doc.tipoDocumento as TipoDocDraft, result.data);
    if (actorId) {
      await prisma.operationDraftDocument.update({
        where: { id: documentId },
        data: { actorId, autoAsignado: true },
      });
      log.info({ documentId, actorId }, 'auto-asignado por RFC/CURP match');
    }
  }

  if (actorId) {
    await mergeIntoActor(actorId, doc.tipoDocumento as TipoDocDraft, result.data);
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
  _tipoDoc: TipoDocDraft,
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
  tipoDoc: TipoDocDraft,
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
