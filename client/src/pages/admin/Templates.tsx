/**
 * Administración › Plantillas
 * ---------------------------------------------------------------
 * Pantalla para subir / reemplazar / eliminar templates editables
 * que el sistema usa como base para auto-llenado de PDFs.
 *
 * Hoy hay un solo template manejado:
 *   - "solicitud-cnbv" → PDF de Solicitud de Crédito Simple (formato CNBV)
 *     usado por la pestaña "Solicitud CNBV" en el detalle de cada contrato.
 *
 * El backend valida que el PDF tenga AcroForm (campos editables) antes de
 * aceptarlo (POST /api/templates/solicitud-cnbv). Si el archivo es escaneado
 * o no tiene formularios, devuelve 400 PDF_HAS_NO_FORM.
 *
 * Restringido a ADMIN / DIRECTOR — el endpoint también valida el rol.
 */
import { useEffect, useRef, useState } from 'react';
import api from '@/lib/api';
import { useAuth } from '@/context/AuthContext';
import { formatDate } from '@/lib/utils';
import {
  FileCheck2, Upload, Trash2, AlertTriangle, CheckCircle2,
  RefreshCw, Shield, FileText,
} from 'lucide-react';

interface TemplateStatus {
  exists: boolean;
  size?: number;
  mtime?: string;
  fields?: number;
}

export default function Templates() {
  const { user } = useAuth();
  const allowed = user?.rol === 'ADMIN' || user?.rol === 'DIRECTOR';

  const [status, setStatus] = useState<TemplateStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const fetchStatus = () => {
    setLoading(true);
    api.get('/templates/solicitud-cnbv/status')
      .then((r) => setStatus(r.data))
      .catch(() => setStatus({ exists: false }))
      .finally(() => setLoading(false));
  };

  useEffect(() => { fetchStatus(); }, []);

  const handleUpload = async (file: File) => {
    setUploading(true);
    setError(null);
    setSuccess(null);
    try {
      const fd = new FormData();
      fd.append('archivo', file);
      const res = await api.post('/templates/solicitud-cnbv', fd, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      setStatus(res.data);
      setSuccess(
        `Template subido (${res.data.fields ?? '?'} campos detectados). Ya puedes generar solicitudes desde cada contrato.`,
      );
    } catch (err: any) {
      const msg =
        err.response?.data?.error?.message ||
        err.response?.data?.error ||
        'No se pudo subir el archivo';
      setError(typeof msg === 'string' ? msg : 'Archivo rechazado');
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  };

  const handleDelete = async () => {
    if (!confirm('¿Eliminar el template? Las nuevas solicitudes no podrán generarse hasta que subas otro.')) return;
    setDeleting(true);
    setError(null);
    setSuccess(null);
    try {
      const res = await api.delete('/templates/solicitud-cnbv');
      setStatus(res.data);
      setSuccess('Template eliminado');
    } catch (err: any) {
      const msg =
        err.response?.data?.error?.message ||
        err.response?.data?.error ||
        'No se pudo eliminar';
      setError(typeof msg === 'string' ? msg : 'Operación rechazada');
    } finally {
      setDeleting(false);
    }
  };

  if (!allowed) {
    return (
      <div className="max-w-2xl mx-auto py-12 text-center">
        <Shield size={40} className="mx-auto text-gray-300 mb-3" />
        <h2 className="text-lg font-semibold text-gray-900">Acceso restringido</h2>
        <p className="text-sm text-gray-500 mt-1">
          Solo ADMIN o DIRECTOR pueden gestionar las plantillas del sistema.
        </p>
      </div>
    );
  }

  return (
    <div className="max-w-3xl mx-auto">
      <div className="mb-6">
        <h1 className="text-xl font-bold text-gray-900 flex items-center gap-2">
          <FileCheck2 size={20} className="text-inyecta-700" />
          Plantillas del sistema
        </h1>
        <p className="text-sm text-gray-500 mt-1">
          Sube los formatos editables (PDF con AcroForm) que el sistema usará para
          auto-llenar documentos por contrato.
        </p>
      </div>

      {success && (
        <div className="mb-4 bg-emerald-50 border border-emerald-200 rounded-lg p-3 text-sm text-emerald-800 flex items-start gap-2">
          <CheckCircle2 size={16} className="mt-0.5 flex-shrink-0" />
          <span>{success}</span>
        </div>
      )}
      {error && (
        <div className="mb-4 bg-red-50 border border-red-200 rounded-lg p-3 text-sm text-red-800 flex items-start gap-2">
          <AlertTriangle size={16} className="mt-0.5 flex-shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {/* Solicitud CNBV */}
      <div className="bg-white rounded-xl border border-gray-200 p-6">
        <div className="flex items-start justify-between mb-4">
          <div className="flex items-start gap-3">
            <div className="w-10 h-10 rounded-lg bg-inyecta-50 flex items-center justify-center">
              <FileText size={18} className="text-inyecta-700" />
            </div>
            <div>
              <h3 className="font-semibold text-gray-900">Solicitud de Crédito CNBV</h3>
              <p className="text-xs text-gray-500 mt-0.5 max-w-md">
                Formato editable de la solicitud de crédito (PFAE / PM). Una vez
                subido, el sistema lo llena automáticamente con los datos del
                contrato — cliente, representante legal, socios, avales, perfil
                transaccional, declaraciones PEP y proveedor.
              </p>
            </div>
          </div>
          <button
            onClick={fetchStatus}
            disabled={loading}
            className="text-gray-400 hover:text-gray-700 disabled:opacity-50"
            title="Refrescar"
          >
            <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
          </button>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-8">
            <div className="animate-spin rounded-full h-6 w-6 border-2 border-inyecta-600 border-t-transparent" />
          </div>
        ) : (
          <>
            {status?.exists ? (
              <div className="bg-emerald-50 border border-emerald-200 rounded-lg p-3 mb-4">
                <div className="flex items-center gap-2 text-emerald-800 text-sm font-medium">
                  <CheckCircle2 size={14} />
                  Template activo
                </div>
                <div className="mt-1 text-xs text-emerald-700 space-y-0.5">
                  <div>
                    Tamaño:{' '}
                    <span className="font-medium">
                      {status.size != null ? `${(status.size / 1024).toFixed(1)} KB` : '—'}
                    </span>
                  </div>
                  <div>
                    Subido:{' '}
                    <span className="font-medium">
                      {status.mtime ? formatDate(status.mtime) : '—'}
                    </span>
                  </div>
                </div>
              </div>
            ) : (
              <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 mb-4 text-sm text-amber-800 flex items-start gap-2">
                <AlertTriangle size={14} className="mt-0.5 flex-shrink-0" />
                <span>No hay template cargado. Súbelo para habilitar la generación automática.</span>
              </div>
            )}

            <div className="flex flex-wrap items-center gap-2">
              <input
                ref={fileRef}
                type="file"
                accept="application/pdf,.pdf"
                className="hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) handleUpload(f);
                }}
              />
              <button
                onClick={() => fileRef.current?.click()}
                disabled={uploading}
                className="flex items-center gap-1.5 px-4 py-2 bg-inyecta-700 hover:bg-inyecta-800 text-white rounded-lg text-sm font-medium shadow-sm disabled:opacity-50"
              >
                {uploading ? (
                  <>
                    <div className="animate-spin rounded-full h-3.5 w-3.5 border-2 border-white border-t-transparent" />
                    Subiendo…
                  </>
                ) : (
                  <>
                    <Upload size={14} />
                    {status?.exists ? 'Reemplazar template' : 'Subir template'}
                  </>
                )}
              </button>

              {status?.exists && (
                <button
                  onClick={handleDelete}
                  disabled={deleting}
                  className="flex items-center gap-1.5 px-3 py-2 border border-red-200 text-red-700 hover:bg-red-50 rounded-lg text-sm font-medium disabled:opacity-50"
                >
                  <Trash2 size={14} />
                  {deleting ? 'Eliminando…' : 'Eliminar'}
                </button>
              )}

              <span className="text-xs text-gray-400 ml-auto">
                Acepta PDF con campos editables (AcroForm). Máx. 20 MB.
              </span>
            </div>
          </>
        )}
      </div>

      <p className="text-xs text-gray-400 mt-4 max-w-2xl">
        <strong>Tip:</strong> el PDF generado por contrato NO se aplana — el usuario
        que lo descarga puede revisar y corregir cualquier campo en Acrobat antes
        de imprimirlo y firmarlo.
      </p>
    </div>
  );
}
