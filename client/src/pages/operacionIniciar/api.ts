/**
 * api.ts — Cliente HTTP para /api/operation-drafts.
 *
 * Wrappers tipados sobre el axios global (lib/api.ts). Cada función
 * devuelve el `data` parseado para que los componentes no traten con
 * AxiosResponse directamente.
 */
import api from '@/lib/api';
import type {
  OperationDraft,
  OperationDraftDetail,
  OperationDraftListItem,
  OperationDraftActor,
  OperationDraftDoc,
  CrearActorPayload,
  EditarActorPayload,
  EditarDocumentoPayload,
  LeaseType,
  CatalogoResponse,
} from './types';

export async function listDrafts(): Promise<OperationDraftListItem[]> {
  const res = await api.get('/operation-drafts');
  return res.data;
}

/**
 * Catálogo de tipos de documento (server-driven). Estático — no
 * depende del draft. La UI lo cachea en estado y arma el dropdown.
 */
export async function getCatalogo(): Promise<CatalogoResponse> {
  const res = await api.get('/operation-drafts/catalogo');
  return res.data;
}

export async function createDraft(tipoOperacion?: LeaseType): Promise<OperationDraft> {
  const res = await api.post('/operation-drafts', { tipoOperacion });
  return res.data;
}

export async function getDraft(id: string): Promise<OperationDraftDetail> {
  const res = await api.get(`/operation-drafts/${id}`);
  return res.data;
}

export async function updateDraft(id: string, tipoOperacion: LeaseType | null): Promise<OperationDraft> {
  const res = await api.patch(`/operation-drafts/${id}`, { tipoOperacion });
  return res.data;
}

export async function deleteDraft(id: string): Promise<void> {
  await api.delete(`/operation-drafts/${id}`);
}

// ─── Actores ───────────────────────────────────────────────────────

export async function createActor(
  draftId: string,
  payload: CrearActorPayload,
): Promise<OperationDraftActor> {
  const res = await api.post(`/operation-drafts/${draftId}/actores`, payload);
  return res.data;
}

export async function updateActor(
  draftId: string,
  actorId: string,
  payload: EditarActorPayload,
): Promise<OperationDraftActor> {
  const res = await api.patch(`/operation-drafts/${draftId}/actores/${actorId}`, payload);
  return res.data;
}

export async function deleteActor(draftId: string, actorId: string): Promise<void> {
  await api.delete(`/operation-drafts/${draftId}/actores/${actorId}`);
}

// ─── Documentos ────────────────────────────────────────────────────

/**
 * Sube un documento al draft. La extracción se hace síncrono en el
 * server: el response ya viene con `extraccion`, `actorId` (si
 * auto-match funcionó) y `extraidoEn` poblados.
 *
 * Puede tardar 5-10s con el provider real de Claude. En el cliente
 * el usuario ve un spinner mientras tanto.
 */
export async function uploadDocument(
  draftId: string,
  file: File,
  tipoDocumento: string,
  actorId: string | null,
): Promise<OperationDraftDoc> {
  const form = new FormData();
  form.append('archivo', file);
  form.append('tipoDocumento', tipoDocumento);
  if (actorId) form.append('actorId', actorId);

  const res = await api.post(`/operation-drafts/${draftId}/documentos`, form, {
    headers: { 'Content-Type': 'multipart/form-data' },
    // El timeout default de axios es 0 (sin timeout). Mantenemos así
    // mientras la extracción sea síncrona — un PDF grande + Claude
    // puede tomar fácil 20s.
    timeout: 60_000,
  });
  return res.data;
}

export async function updateDocument(
  draftId: string,
  docId: string,
  payload: EditarDocumentoPayload,
): Promise<OperationDraftDoc> {
  const res = await api.patch(`/operation-drafts/${draftId}/documentos/${docId}`, payload);
  return res.data;
}

export async function deleteDocument(draftId: string, docId: string): Promise<void> {
  await api.delete(`/operation-drafts/${draftId}/documentos/${docId}`);
}
