/**
 * OperacionIniciar — pantalla principal del flujo "borrador de
 * operación". Una ruta cubre dos casos:
 *
 *   /operaciones/iniciar           → si no hay :draftId, crea uno
 *                                    y redirige a /:draftId.
 *   /operaciones/iniciar/:draftId  → carga el borrador y renderiza
 *                                    las 3 columnas.
 *
 * Layout:
 *   ┌── Header (folio + tipo operación + descartar)        ──┐
 *   │  (Checklists de completitud → placeholder en v0)       │
 *   ├──────────┬──────────────┬───────────────────────────────┤
 *   │ Actores  │  Documentos  │  Datos consolidados           │
 *   │ (3 col)  │  (5 col)     │  (4 col)                      │
 *   └──────────┴──────────────┴───────────────────────────────┘
 *
 * Mutaciones optimistas: tras cada acción exitosa, re-fetchamos
 * el draft completo. Para un MVP es suficiente; en v0.1 se puede
 * pulir con cache de react-query.
 */
import { useEffect, useState } from 'react';
import { useNavigate, useParams, Link } from 'react-router-dom';
import { ArrowLeft, Trash2, AlertCircle } from 'lucide-react';
import { ActorPanel } from './ActorPanel';
import { DocumentDropzone } from './DocumentDropzone';
import { ActorDataPanel } from './ActorDataPanel';
import { AddActorModal } from './AddActorModal';
import * as draftApi from './api';
import type {
  OperationDraftDetail,
  DraftActorRol,
  TipoDocSoportado,
  ActorDatosConsolidados,
  CrearActorPayload,
  LeaseType,
} from './types';

function extractApiError(err: unknown): string {
  const e = err as { response?: { data?: { error?: { message?: string } } }; message?: string };
  return e?.response?.data?.error?.message ?? e?.message ?? 'Error inesperado';
}

export default function OperacionIniciar() {
  const navigate = useNavigate();
  const { draftId: draftIdParam } = useParams<{ draftId?: string }>();

  const [draft, setDraft] = useState<OperationDraftDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [selectedActorId, setSelectedActorId] = useState<string | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [modalRolDefault, setModalRolDefault] = useState<DraftActorRol | undefined>(undefined);

  // Crear borrador en el primer mount cuando no haya :draftId
  useEffect(() => {
    if (draftIdParam) return;
    let cancel = false;
    (async () => {
      try {
        const d = await draftApi.createDraft();
        if (!cancel) {
          navigate(`/operaciones/iniciar/${d.id}`, { replace: true });
        }
      } catch (err) {
        if (!cancel) setLoadError(extractApiError(err));
        if (!cancel) setLoading(false);
      }
    })();
    return () => { cancel = true; };
  }, [draftIdParam, navigate]);

  const refetch = async () => {
    if (!draftIdParam) return;
    try {
      const d = await draftApi.getDraft(draftIdParam);
      setDraft(d);
      // Si el actor seleccionado ya no existe (se borró), reset.
      if (selectedActorId && !d.actores.find((a) => a.id === selectedActorId)) {
        setSelectedActorId(d.actores[0]?.id ?? null);
      }
      // Auto-seleccionar el primero si no hay nada seleccionado.
      if (!selectedActorId && d.actores.length > 0) {
        setSelectedActorId(d.actores[0].id);
      }
    } catch (err) {
      setLoadError(extractApiError(err));
    }
  };

  // Carga inicial del draft
  useEffect(() => {
    if (!draftIdParam) return;
    setLoading(true);
    setLoadError(null);
    draftApi.getDraft(draftIdParam)
      .then((d) => {
        setDraft(d);
        if (d.actores.length > 0) setSelectedActorId(d.actores[0].id);
      })
      .catch((err) => setLoadError(extractApiError(err)))
      .finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draftIdParam]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="animate-spin rounded-full h-8 w-8 border-2 border-inyecta-600 border-t-transparent" />
      </div>
    );
  }

  if (loadError || !draft) {
    return (
      <div className="max-w-2xl mx-auto py-12 text-center">
        <AlertCircle size={32} className="mx-auto text-red-500 mb-3" />
        <p className="text-red-700 font-medium mb-2">{loadError ?? 'No se pudo cargar el borrador'}</p>
        <Link to="/" className="text-inyecta-700 hover:underline text-sm">Volver al dashboard</Link>
      </div>
    );
  }

  // ─── Handlers ────────────────────────────────────────────────────

  const handleSetTipoOperacion = async (tipo: LeaseType | null) => {
    try {
      await draftApi.updateDraft(draft.id, tipo);
      await refetch();
    } catch (err) {
      alert('No se pudo guardar el tipo de operación: ' + extractApiError(err));
    }
  };

  const handleCreateActor = async (payload: CrearActorPayload) => {
    const a = await draftApi.createActor(draft.id, payload);
    await refetch();
    setSelectedActorId(a.id);
  };

  const handleDeleteActor = async (actorId: string) => {
    if (!confirm('¿Quitar este involucrado del borrador? Sus documentos quedarán sin asignar.')) return;
    try {
      await draftApi.deleteActor(draft.id, actorId);
      await refetch();
    } catch (err) {
      alert('No se pudo borrar: ' + extractApiError(err));
    }
  };

  const handleSaveDatos = async (datos: ActorDatosConsolidados) => {
    if (!selectedActorId) return;
    try {
      await draftApi.updateActor(draft.id, selectedActorId, { datosConsolidados: datos });
      // Re-fetch sin disturbar la selección — solo actualiza el estado.
      const fresh = await draftApi.getDraft(draft.id);
      setDraft(fresh);
    } catch (err) {
      console.error('save datos failed', err);
    }
  };

  const handleUploadDoc = async (file: File, tipo: TipoDocSoportado) => {
    try {
      await draftApi.uploadDocument(draft.id, file, tipo, null);
      await refetch();
    } catch (err) {
      alert('No se pudo subir el documento: ' + extractApiError(err));
    }
  };

  const handleReassignDoc = async (docId: string, actorId: string | null) => {
    try {
      await draftApi.updateDocument(draft.id, docId, { actorId });
      await refetch();
    } catch (err) {
      alert('No se pudo reasignar: ' + extractApiError(err));
    }
  };

  const handleChangeTipoDoc = async (docId: string, tipo: string) => {
    try {
      await draftApi.updateDocument(draft.id, docId, { tipoDocumento: tipo });
      await refetch();
    } catch (err) {
      alert('No se pudo cambiar tipo: ' + extractApiError(err));
    }
  };

  const handleDeleteDoc = async (docId: string) => {
    if (!confirm('¿Borrar este documento? Esta acción no se puede deshacer.')) return;
    try {
      await draftApi.deleteDocument(draft.id, docId);
      await refetch();
    } catch (err) {
      alert('No se pudo borrar: ' + extractApiError(err));
    }
  };

  const handleDiscardDraft = async () => {
    if (!confirm('¿Descartar este borrador? Los documentos subidos también se perderán.')) return;
    try {
      await draftApi.deleteDraft(draft.id);
      navigate('/');
    } catch (err) {
      alert('No se pudo descartar: ' + extractApiError(err));
    }
  };

  const yaHayTitular = draft.actores.some((a) => a.rol === 'TITULAR');
  const selectedActor = draft.actores.find((a) => a.id === selectedActorId) ?? null;
  // Docs asignados al actor seleccionado vs. todos los demás.
  const allDocsAsignados = draft.actores.flatMap((a) => a.documentos);

  return (
    <div className="h-[calc(100vh-60px)] flex flex-col">
      {/* Header */}
      <header className="bg-white border-b border-gray-200 px-4 py-3 flex items-center justify-between shrink-0">
        <div className="flex items-center gap-3">
          <Link to="/" className="text-gray-400 hover:text-gray-600">
            <ArrowLeft size={18} />
          </Link>
          <div>
            <h1 className="text-base font-bold text-gray-900">Nueva operación</h1>
            <p className="text-xs text-gray-500">
              Sube documentos en cualquier orden — el sistema extrae y consolida por actor.
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs text-gray-500">
            Borrador <code className="font-mono text-gray-700">{draft.id.slice(0, 8)}…</code>
          </span>
          <select
            value={draft.tipoOperacion ?? ''}
            onChange={(e) => {
              const v = e.target.value;
              void handleSetTipoOperacion(v === '' ? null : (v as LeaseType));
            }}
            className="border border-gray-300 rounded px-2 py-1 text-xs bg-white"
          >
            <option value="">Tipo de operación...</option>
            <option value="PURO">Arrendamiento PURO</option>
            <option value="FINANCIERO">Arrendamiento FINANCIERO</option>
          </select>
          <button
            onClick={handleDiscardDraft}
            className="text-xs text-red-600 hover:text-red-800 flex items-center gap-1 px-2 py-1 rounded hover:bg-red-50"
            title="Descartar borrador"
          >
            <Trash2 size={12} /> Descartar
          </button>
        </div>
      </header>

      {/* Placeholder de checklists (Fase v0.1) */}
      <div className="bg-amber-50 border-b border-amber-200 px-4 py-2 text-xs text-amber-800 shrink-0">
        💡 Las checklists de completitud (¿lista para CNBV? ¿lista para contrato?) y el botón
        Finalizar se agregan en v0.1. Hoy puedes capturar todo lo que necesites y volver después.
      </div>

      {/* 3 columnas */}
      <main className="flex-1 grid grid-cols-12 gap-3 p-3 overflow-hidden">
        <div className="col-span-3 overflow-hidden">
          <ActorPanel
            actores={draft.actores}
            selectedId={selectedActorId}
            onSelect={setSelectedActorId}
            onAddTitular={() => { setModalRolDefault('TITULAR'); setModalOpen(true); }}
            onAddAval={() => { setModalRolDefault('AVAL'); setModalOpen(true); }}
            onDelete={handleDeleteActor}
          />
        </div>
        <div className="col-span-5 overflow-hidden">
          <DocumentDropzone
            docsAsignados={allDocsAsignados}
            docsSinAsignar={draft.docsSinAsignar}
            actores={draft.actores}
            onUpload={handleUploadDoc}
            onReassign={handleReassignDoc}
            onChangeTipo={handleChangeTipoDoc}
            onDelete={handleDeleteDoc}
          />
        </div>
        <div className="col-span-4 overflow-hidden">
          <ActorDataPanel actor={selectedActor} onSave={handleSaveDatos} />
        </div>
      </main>

      <AddActorModal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        onSubmit={handleCreateActor}
        yaHayTitular={yaHayTitular}
        rolDefault={modalRolDefault}
      />
    </div>
  );
}
