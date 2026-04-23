/**
 * ExpedienteTab — Pestaña de "Documentos" del detalle de contrato.
 *
 * Sustituye el viejo "Documentos por etapa" por la vista del nuevo
 * expediente organizado por actor (Inyecta SOFOM checklists oficiales).
 *
 * Estructura:
 *   - Header con cobertura global ("Expediente X% completo")
 *   - Botones: + Agregar Aval (PF/PM)  ·  📄 Imprimir checklist
 *   - Una sección colapsable por actor (OPERACION, SOLICITANTE,
 *     REPRESENTANTE_LEGAL, PRINCIPAL_ACCIONISTA, AVAL N, BIEN_ARRENDADO,
 *     FORMALIZACION). Cada sección muestra:
 *       · Catálogo informativo de documentos esperados (no bloquea).
 *       · Lista de documentos subidos (con toggles físico/digital,
 *         estatus PENDIENTE/VALIDADO/RECHAZADO, descargar, eliminar).
 *       · Botón "+ Subir documento" (con selector de tipo del catálogo
 *         o "Libre/Sin clasificar").
 *
 * Los catálogos son INFORMATIVOS — el usuario puede subir cualquier
 * archivo bajo "Libre" si no encaja en una categoría predefinida.
 */
import { useEffect, useState } from 'react';
import { pdf } from '@react-pdf/renderer';
import {
  Plus, FileText, Download, Trash2, RefreshCw,
  CheckCircle2, Clock, XCircle, Printer, X, Upload,
} from 'lucide-react';
import api from '@/lib/api';
import { ChecklistExpedientePDF } from '@/lib/pdf/ChecklistExpedientePDF';

// ───────────────────────────────────────────────────────────────────
// Tipos del response del backend
// ───────────────────────────────────────────────────────────────────

type DocumentoEstatus = 'PENDIENTE' | 'VALIDADO' | 'RECHAZADO';
type ActorTipo =
  | 'OPERACION' | 'SOLICITANTE' | 'REPRESENTANTE_LEGAL'
  | 'PRINCIPAL_ACCIONISTA' | 'AVAL' | 'BIEN_ARRENDADO' | 'FORMALIZACION';
type ActorSubtipo = 'PF' | 'PM' | null;

interface CatalogoItem {
  clave: string;
  etiqueta: string;
  descripcion?: string;
  /** Si es opcional (informativo, no bloquea uploads). */
  opcional?: boolean;
  /** Compat alias antiguo. */
  aplica?: boolean;
}

interface ExpedienteDocumento {
  id: string;
  tipoDocumento: string | null;
  nombreArchivo: string;
  archivoUrl: string;
  tieneFisico: boolean;
  tieneDigital: boolean;
  estatus: DocumentoEstatus;
  notas: string | null;
  fechaSubida: string;
  subidoPorUser?: { id: string; nombre: string; apellidos: string } | null;
}

interface ExpedienteActorView {
  id: string;
  tipo: ActorTipo;
  subtipo: ActorSubtipo;
  orden: number;
  nombre: string | null;
  rfc: string | null;
  etiqueta: string;
  catalogo: CatalogoItem[];
  documentos: ExpedienteDocumento[];
}

interface ExpedienteResponse {
  contract: {
    id: string;
    folio: string;
    tipoTitular: 'PFAE' | 'PM';
    bienDescripcion: string;
    client: {
      tipo: 'PFAE' | 'PM';
      nombre: string | null;
      apellidoPaterno: string | null;
      apellidoMaterno: string | null;
      razonSocial: string | null;
      rfc: string | null;
    };
  };
  cobertura: {
    total: number;
    cubiertos: number;
    porcentaje: number;
    porActor: Record<string, { total: number; cubiertos: number; porcentaje: number }>;
  };
  actores: ExpedienteActorView[];
}

// ───────────────────────────────────────────────────────────────────
// Helpers de presentación
// ───────────────────────────────────────────────────────────────────

const ESTATUS_BADGE: Record<DocumentoEstatus, { label: string; cls: string; Icon: typeof CheckCircle2 }> = {
  PENDIENTE: { label: 'Pendiente revisión', cls: 'bg-amber-100 text-amber-800 border-amber-300', Icon: Clock },
  VALIDADO: { label: 'Validado', cls: 'bg-emerald-100 text-emerald-800 border-emerald-300', Icon: CheckCircle2 },
  RECHAZADO: { label: 'Rechazado', cls: 'bg-red-100 text-red-800 border-red-300', Icon: XCircle },
};

const TIPO_COLOR: Record<ActorTipo, string> = {
  OPERACION: 'bg-blue-50 border-blue-200',
  SOLICITANTE: 'bg-violet-50 border-violet-200',
  REPRESENTANTE_LEGAL: 'bg-indigo-50 border-indigo-200',
  PRINCIPAL_ACCIONISTA: 'bg-fuchsia-50 border-fuchsia-200',
  AVAL: 'bg-amber-50 border-amber-200',
  BIEN_ARRENDADO: 'bg-emerald-50 border-emerald-200',
  FORMALIZACION: 'bg-sky-50 border-sky-200',
};

function fileBaseUrl() {
  return (api.defaults.baseURL || '').replace(/\/api$/, '');
}

// ───────────────────────────────────────────────────────────────────
// Componente principal
// ───────────────────────────────────────────────────────────────────

export default function ExpedienteTab({ contractId }: { contractId: string }) {
  const [data, setData] = useState<ExpedienteResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [reloading, setReloading] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [showAddAval, setShowAddAval] = useState(false);
  const [printing, setPrinting] = useState(false);

  const load = async (silent = false) => {
    if (!silent) setLoading(true);
    else setReloading(true);
    try {
      const r = await api.get(`/contracts/${contractId}/expediente`);
      setData(r.data);
      setErr(null);
    } catch (e: unknown) {
      setErr(
        (e as { response?: { data?: { error?: { message?: string } } } })?.response?.data?.error?.message ||
          'Error al cargar expediente',
      );
    } finally {
      setLoading(false);
      setReloading(false);
    }
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [contractId]);

  const handlePrint = async () => {
    if (!data) return;
    setPrinting(true);
    try {
      const blob = await pdf(<ChecklistExpedientePDF data={data} />).toBlob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `Expediente_${data.contract.folio}.pdf`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (e) {
      console.error(e);
      alert('Error al generar el checklist PDF');
    } finally {
      setPrinting(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="animate-spin rounded-full h-6 w-6 border-2 border-inyecta-600 border-t-transparent" />
      </div>
    );
  }

  if (err || !data) {
    return (
      <div className="bg-red-50 border border-red-200 rounded-lg p-4 text-sm text-red-800">
        {err || 'No se pudo cargar el expediente.'}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Encabezado: cobertura + acciones */}
      <div className="bg-white rounded-xl border border-gray-200 p-4">
        <div className="flex items-center justify-between gap-4 mb-3">
          <div>
            <div className="text-sm text-gray-500">Cobertura del expediente</div>
            <div className="text-2xl font-semibold text-gray-900">
              Expediente {data.cobertura.porcentaje}% completo
            </div>
            <div className="text-xs text-gray-500 mt-0.5">
              {data.cobertura.cubiertos} de {data.cobertura.total} documentos esperados
              <span className="ml-2 text-gray-400">
                · catálogo informativo, no bloquea operación
              </span>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => load(true)}
              disabled={reloading}
              className="inline-flex items-center gap-1 px-3 py-1.5 text-xs text-gray-700 hover:bg-gray-100 rounded border border-gray-200"
              title="Recargar expediente"
            >
              <RefreshCw size={12} className={reloading ? 'animate-spin' : ''} />
              Recargar
            </button>
            <button
              onClick={handlePrint}
              disabled={printing}
              className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-medium text-white bg-inyecta-600 hover:bg-inyecta-700 rounded disabled:opacity-50"
            >
              <Printer size={12} />
              {printing ? 'Generando…' : 'Imprimir checklist'}
            </button>
            <button
              onClick={() => setShowAddAval(true)}
              className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-medium text-white bg-amber-600 hover:bg-amber-700 rounded"
            >
              <Plus size={12} />
              Agregar Aval
            </button>
          </div>
        </div>
        <div className="w-full bg-gray-100 rounded-full h-2">
          <div
            className={`h-2 rounded-full transition-all ${
              data.cobertura.porcentaje === 100
                ? 'bg-emerald-500'
                : data.cobertura.porcentaje >= 50
                  ? 'bg-amber-500'
                  : 'bg-red-400'
            }`}
            style={{ width: `${data.cobertura.porcentaje}%` }}
          />
        </div>
      </div>

      {/* Secciones por actor */}
      <div className="space-y-3">
        {data.actores.map((actor) => (
          <ActorSection
            key={actor.id}
            actor={actor}
            cobertura={data.cobertura.porActor[actor.id]}
            onChange={() => load(true)}
          />
        ))}
      </div>

      {showAddAval && (
        <AddAvalModal
          contractId={contractId}
          onClose={() => setShowAddAval(false)}
          onCreated={() => {
            setShowAddAval(false);
            load(true);
          }}
        />
      )}
    </div>
  );
}

// ───────────────────────────────────────────────────────────────────
// Sección de un actor (con sus documentos y catálogo)
// ───────────────────────────────────────────────────────────────────

function ActorSection({
  actor,
  cobertura,
  onChange,
}: {
  actor: ExpedienteActorView;
  cobertura?: { total: number; cubiertos: number; porcentaje: number };
  onChange: () => void;
}) {
  const [open, setOpen] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [tipoSelected, setTipoSelected] = useState<string>('');

  const aplicables = actor.catalogo.filter((c) => c.aplica !== false);
  const tieneFijos = actor.tipo !== 'AVAL';
  const colorCls = TIPO_COLOR[actor.tipo] || 'bg-gray-50 border-gray-200';

  const handleUpload = async (file: File) => {
    setUploading(true);
    const fd = new FormData();
    fd.append('archivo', file);
    if (tipoSelected) fd.append('tipoDocumento', tipoSelected);
    try {
      await api.post(`/expediente/actores/${actor.id}/documentos`, fd, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      setTipoSelected('');
      onChange();
    } catch (e: unknown) {
      const msg =
        (e as { response?: { data?: { error?: { message?: string } } } })?.response?.data?.error
          ?.message || 'Error al subir el archivo';
      alert(msg);
    } finally {
      setUploading(false);
    }
  };

  const handleDeleteActor = async () => {
    if (!confirm(`¿Eliminar el actor "${actor.etiqueta}" y todos sus documentos?`)) return;
    try {
      await api.delete(`/expediente/actores/${actor.id}`);
      onChange();
    } catch (e: unknown) {
      const msg =
        (e as { response?: { data?: { error?: { message?: string } } } })?.response?.data?.error
          ?.message || 'Error al eliminar el actor';
      alert(msg);
    }
  };

  return (
    <div className={`rounded-xl border ${colorCls}`}>
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="w-full flex items-center justify-between gap-3 p-3 text-left"
      >
        <div className="flex items-center gap-2 min-w-0">
          <div className="text-[10px] font-bold uppercase tracking-wide text-gray-600 px-2 py-0.5 bg-white/60 rounded">
            {actor.tipo}
          </div>
          <h3 className="font-semibold text-gray-900 truncate">{actor.etiqueta}</h3>
          {actor.rfc && <span className="text-xs text-gray-500">· {actor.rfc}</span>}
        </div>
        <div className="flex items-center gap-2 text-xs text-gray-600">
          {cobertura && (
            <span>
              {cobertura.cubiertos}/{cobertura.total} ·{' '}
              <strong className="text-gray-800">{cobertura.porcentaje}%</strong>
            </span>
          )}
          <span className="text-gray-400">{open ? '▾' : '▸'}</span>
        </div>
      </button>

      {open && (
        <div className="px-3 pb-3 space-y-3">
          {/* Documentos subidos */}
          {actor.documentos.length === 0 ? (
            <p className="text-xs text-gray-500 italic px-2">Sin documentos cargados aún.</p>
          ) : (
            <div className="space-y-1.5">
              {actor.documentos.map((d) => (
                <DocumentoRow key={d.id} doc={d} catalogo={actor.catalogo} onChange={onChange} />
              ))}
            </div>
          )}

          {/* Subir nuevo */}
          <div className="bg-white/70 rounded border border-gray-200 p-2 flex items-center gap-2 flex-wrap">
            <select
              value={tipoSelected}
              onChange={(e) => setTipoSelected(e.target.value)}
              className="text-xs border border-gray-200 rounded px-2 py-1 bg-white"
              disabled={uploading}
            >
              <option value="">Libre / Sin clasificar</option>
              {aplicables.map((c) => (
                <option key={c.clave} value={c.clave}>
                  {c.etiqueta}
                </option>
              ))}
            </select>
            <label className="inline-flex items-center gap-1 text-xs px-3 py-1 bg-inyecta-600 hover:bg-inyecta-700 text-white rounded font-medium cursor-pointer">
              <Upload size={12} />
              {uploading ? 'Subiendo…' : 'Subir documento'}
              <input
                type="file"
                accept=".pdf,.jpg,.jpeg,.png,.webp,.doc,.docx,.xls,.xlsx"
                className="hidden"
                disabled={uploading}
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) handleUpload(f);
                  e.target.value = '';
                }}
              />
            </label>
            {!tieneFijos && (
              <button
                onClick={handleDeleteActor}
                className="ml-auto inline-flex items-center gap-1 text-xs px-2 py-1 text-red-700 hover:bg-red-50 rounded"
                title="Eliminar este aval del expediente"
              >
                <Trash2 size={12} />
                Eliminar aval
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// ───────────────────────────────────────────────────────────────────
// Fila de documento (con toggles físico/digital + estatus)
// ───────────────────────────────────────────────────────────────────

function DocumentoRow({
  doc,
  catalogo,
  onChange,
}: {
  doc: ExpedienteDocumento;
  catalogo: CatalogoItem[];
  onChange: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const badge = ESTATUS_BADGE[doc.estatus];
  const tipoEtiqueta =
    catalogo.find((c) => c.clave === doc.tipoDocumento)?.etiqueta ||
    doc.tipoDocumento ||
    'Libre / Sin clasificar';

  const patch = async (payload: Partial<ExpedienteDocumento>) => {
    setBusy(true);
    try {
      await api.patch(`/expediente/documentos/${doc.id}`, payload);
      onChange();
    } catch (e: unknown) {
      const msg =
        (e as { response?: { data?: { error?: { message?: string } } } })?.response?.data?.error
          ?.message || 'Error al actualizar el documento';
      alert(msg);
    } finally {
      setBusy(false);
    }
  };

  const handleDelete = async () => {
    if (!confirm(`¿Eliminar el documento "${doc.nombreArchivo}"?`)) return;
    setBusy(true);
    try {
      await api.delete(`/expediente/documentos/${doc.id}`);
      onChange();
    } catch (e: unknown) {
      const msg =
        (e as { response?: { data?: { error?: { message?: string } } } })?.response?.data?.error
          ?.message || 'Error al eliminar';
      alert(msg);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="bg-white rounded border border-gray-200 px-3 py-2 text-sm">
      <div className="flex items-start justify-between gap-2">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <FileText size={14} className="text-gray-400 flex-shrink-0" />
            <span className="font-medium text-gray-800 truncate">{tipoEtiqueta}</span>
            <span
              className={`inline-flex items-center gap-1 text-[10px] font-semibold px-1.5 py-0.5 border rounded ${badge.cls}`}
            >
              <badge.Icon size={10} />
              {badge.label}
            </span>
          </div>
          <p className="text-[11px] text-gray-500 mt-0.5 truncate">
            📎 {doc.nombreArchivo} · subido{' '}
            {new Date(doc.fechaSubida).toLocaleDateString('es-MX')}
            {doc.subidoPorUser && ` por ${doc.subidoPorUser.nombre}`}
          </p>
          {doc.notas && (
            <p className="text-[11px] text-gray-700 mt-0.5 italic">"{doc.notas}"</p>
          )}
        </div>
        <div className="flex items-center gap-1 flex-shrink-0">
          <a
            href={`${fileBaseUrl()}${doc.archivoUrl}`}
            target="_blank"
            rel="noopener noreferrer"
            className="text-[10px] px-2 py-1 text-gray-700 hover:bg-gray-100 rounded inline-flex items-center gap-1"
            title="Descargar / abrir"
          >
            <Download size={11} />
          </a>
          <button
            onClick={handleDelete}
            disabled={busy}
            className="text-[10px] px-2 py-1 text-red-600 hover:bg-red-50 rounded inline-flex items-center gap-1"
            title="Eliminar"
          >
            <Trash2 size={11} />
          </button>
        </div>
      </div>
      <div className="flex items-center gap-3 mt-2 text-xs text-gray-700 flex-wrap">
        <label className="inline-flex items-center gap-1 cursor-pointer">
          <input
            type="checkbox"
            checked={doc.tieneDigital}
            onChange={(e) => patch({ tieneDigital: e.target.checked })}
            disabled={busy}
            className="accent-inyecta-600"
          />
          Digital
        </label>
        <label className="inline-flex items-center gap-1 cursor-pointer">
          <input
            type="checkbox"
            checked={doc.tieneFisico}
            onChange={(e) => patch({ tieneFisico: e.target.checked })}
            disabled={busy}
            className="accent-inyecta-600"
          />
          Físico (en oficina)
        </label>
        <div className="flex items-center gap-1 ml-auto">
          <span className="text-gray-500">Estatus:</span>
          <select
            value={doc.estatus}
            onChange={(e) => patch({ estatus: e.target.value as DocumentoEstatus })}
            disabled={busy}
            className="text-xs border border-gray-200 rounded px-1.5 py-0.5"
          >
            <option value="PENDIENTE">Pendiente</option>
            <option value="VALIDADO">Validado</option>
            <option value="RECHAZADO">Rechazado</option>
          </select>
        </div>
      </div>
    </div>
  );
}

// ───────────────────────────────────────────────────────────────────
// Modal: Agregar nuevo aval
// ───────────────────────────────────────────────────────────────────

function AddAvalModal({
  contractId,
  onClose,
  onCreated,
}: {
  contractId: string;
  onClose: () => void;
  onCreated: () => void;
}) {
  const [subtipo, setSubtipo] = useState<'PF' | 'PM'>('PF');
  const [nombre, setNombre] = useState('');
  const [rfc, setRfc] = useState('');
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const submit = async () => {
    if (!nombre.trim()) {
      setErr('El nombre es requerido');
      return;
    }
    setSaving(true);
    setErr(null);
    try {
      await api.post(`/contracts/${contractId}/expediente/actores`, {
        tipo: 'AVAL',
        subtipo,
        nombre: nombre.trim(),
        rfc: rfc.trim() || null,
      });
      onCreated();
    } catch (e: unknown) {
      setErr(
        (e as { response?: { data?: { error?: { message?: string } } } })?.response?.data?.error
          ?.message || 'Error al crear el aval',
      );
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-md">
        <div className="flex items-center justify-between p-4 border-b">
          <h3 className="font-semibold text-gray-900">Agregar aval al expediente</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
            <X size={18} />
          </button>
        </div>
        <div className="p-4 space-y-3">
          <div>
            <label className="text-xs font-medium text-gray-700">Tipo de aval</label>
            <div className="flex gap-2 mt-1">
              <button
                type="button"
                onClick={() => setSubtipo('PF')}
                className={`flex-1 px-3 py-2 text-sm rounded border ${
                  subtipo === 'PF'
                    ? 'bg-inyecta-50 border-inyecta-400 text-inyecta-700 font-medium'
                    : 'bg-white border-gray-200 text-gray-700'
                }`}
              >
                Persona Física
              </button>
              <button
                type="button"
                onClick={() => setSubtipo('PM')}
                className={`flex-1 px-3 py-2 text-sm rounded border ${
                  subtipo === 'PM'
                    ? 'bg-inyecta-50 border-inyecta-400 text-inyecta-700 font-medium'
                    : 'bg-white border-gray-200 text-gray-700'
                }`}
              >
                Persona Moral
              </button>
            </div>
          </div>
          <div>
            <label className="text-xs font-medium text-gray-700">
              {subtipo === 'PM' ? 'Razón social' : 'Nombre completo'}
            </label>
            <input
              value={nombre}
              onChange={(e) => setNombre(e.target.value)}
              className="mt-1 w-full px-3 py-2 text-sm border border-gray-200 rounded"
              placeholder={subtipo === 'PM' ? 'Empresa SA de CV' : 'Juan Pérez García'}
            />
          </div>
          <div>
            <label className="text-xs font-medium text-gray-700">RFC (opcional)</label>
            <input
              value={rfc}
              onChange={(e) => setRfc(e.target.value.toUpperCase())}
              className="mt-1 w-full px-3 py-2 text-sm border border-gray-200 rounded"
              placeholder="XAXX010101000"
              maxLength={13}
            />
          </div>
          {err && (
            <div className="bg-red-50 border border-red-200 rounded p-2 text-xs text-red-700">
              {err}
            </div>
          )}
        </div>
        <div className="flex justify-end gap-2 p-4 border-t bg-gray-50 rounded-b-xl">
          <button
            type="button"
            onClick={onClose}
            disabled={saving}
            className="px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-100 rounded"
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={submit}
            disabled={saving}
            className="px-3 py-1.5 text-sm font-medium text-white bg-inyecta-600 hover:bg-inyecta-700 rounded disabled:opacity-50"
          >
            {saving ? 'Creando…' : 'Crear aval'}
          </button>
        </div>
      </div>
    </div>
  );
}
