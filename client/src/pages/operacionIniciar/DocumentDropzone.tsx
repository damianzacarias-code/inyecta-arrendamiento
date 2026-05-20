/**
 * DocumentDropzone — columna central. Drop zone + lista de docs
 * subidos al draft.
 *
 * Cada doc muestra:
 *   - Tipo detectado (badge de color)
 *   - % de confianza
 *   - Dropdown para reasignar el actor
 *   - Botón borrar
 *   - Marca ⚠ si la extracción falló o si el actor está sin asignar
 *     y el sistema no pudo auto-matchear
 */
import { useState, useRef } from 'react';
import { Upload, FileText, Loader2, Trash2, AlertTriangle } from 'lucide-react';
import type {
  OperationDraftActor,
  OperationDraftDoc,
  TipoDocSoportado,
} from './types';

interface Props {
  docsAsignados: OperationDraftDoc[];
  docsSinAsignar: OperationDraftDoc[];
  actores: OperationDraftActor[];
  onUpload: (file: File, tipo: TipoDocSoportado) => Promise<void>;
  onReassign: (docId: string, actorId: string | null) => Promise<void>;
  onChangeTipo: (docId: string, tipo: string) => Promise<void>;
  onDelete: (docId: string) => Promise<void>;
}

const TIPOS_V0: { value: TipoDocSoportado; label: string; bg: string; text: string }[] = [
  { value: 'INE',                    label: 'INE',                    bg: 'bg-emerald-100', text: 'text-emerald-700' },
  { value: 'CSF',                    label: 'CSF',                    bg: 'bg-blue-100',    text: 'text-blue-700' },
  { value: 'COMPROBANTE_DOMICILIO',  label: 'Comprobante domicilio',  bg: 'bg-amber-100',   text: 'text-amber-700' },
  { value: 'OTRO',                   label: 'Otro',                   bg: 'bg-gray-100',    text: 'text-gray-700' },
];

function tipoStyle(tipo: string) {
  const found = TIPOS_V0.find((t) => t.value === tipo);
  return found ?? { value: 'OTRO', label: tipo, bg: 'bg-gray-100', text: 'text-gray-700' };
}

function DocRow({
  doc,
  actores,
  onReassign,
  onChangeTipo,
  onDelete,
}: {
  doc: OperationDraftDoc;
  actores: OperationDraftActor[];
  onReassign: (docId: string, actorId: string | null) => Promise<void>;
  onChangeTipo: (docId: string, tipo: string) => Promise<void>;
  onDelete: (docId: string) => Promise<void>;
}) {
  const style = tipoStyle(doc.tipoDocumento);
  const sinAsignar = !doc.actorId;
  const conError = !!doc.extraccionError;
  const warn = sinAsignar || conError;

  return (
    <div className={`flex items-center gap-3 p-2.5 rounded border ${
      warn ? 'border-amber-300 bg-amber-50' : 'border-gray-200 hover:bg-gray-50'
    }`}>
      {warn ? <AlertTriangle size={18} className="text-amber-600 shrink-0" /> : <FileText size={18} className="text-gray-400 shrink-0" />}
      <div className="flex-1 min-w-0">
        <div className="text-sm font-medium text-gray-900 truncate">{doc.nombreArchivo}</div>
        <div className="flex items-center gap-1.5 mt-0.5">
          <span className={`text-[10px] px-1.5 py-0.5 rounded ${style.bg} ${style.text}`}>
            {style.label}
          </span>
          {doc.confianzaExtraccion !== null && (
            <span className="text-[10px] text-gray-500">{doc.confianzaExtraccion}% confianza</span>
          )}
          {doc.autoAsignado && doc.actorId && (
            <span className="text-[10px] text-emerald-700">· auto</span>
          )}
          {conError && (
            <span className="text-[10px] text-red-700">· error: {doc.extraccionError}</span>
          )}
          {sinAsignar && !conError && (
            <span className="text-[10px] text-amber-700 font-medium">· sin actor — asigna manual</span>
          )}
        </div>
      </div>
      <select
        value={doc.tipoDocumento}
        onChange={(e) => { void onChangeTipo(doc.id, e.target.value); }}
        className="text-xs border border-gray-300 rounded px-1.5 py-1 max-w-[120px] bg-white"
      >
        {TIPOS_V0.map((t) => (
          <option key={t.value} value={t.value}>{t.label}</option>
        ))}
      </select>
      <select
        value={doc.actorId ?? ''}
        onChange={(e) => { void onReassign(doc.id, e.target.value || null); }}
        className={`text-xs border rounded px-1.5 py-1 max-w-[140px] bg-white ${
          sinAsignar ? 'border-amber-400' : 'border-gray-300'
        }`}
      >
        <option value="">— sin asignar —</option>
        {actores.map((a) => (
          <option key={a.id} value={a.id}>→ {a.nombre}</option>
        ))}
      </select>
      <button
        onClick={() => { void onDelete(doc.id); }}
        className="text-gray-400 hover:text-red-500"
        title="Borrar documento"
      >
        <Trash2 size={14} />
      </button>
    </div>
  );
}

export function DocumentDropzone({
  docsAsignados, docsSinAsignar, actores, onUpload, onReassign, onChangeTipo, onDelete,
}: Props) {
  const [dragging, setDragging] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [tipoSeleccionado, setTipoSeleccionado] = useState<TipoDocSoportado>('INE');
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFiles = async (files: FileList | File[]) => {
    setUploading(true);
    try {
      // v0: subimos uno por uno (el server extrae síncrono). En v0.1
      // si pasamos a cola async, podemos paralelizar.
      for (const f of Array.from(files)) {
        await onUpload(f, tipoSeleccionado);
      }
    } finally {
      setUploading(false);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragging(false);
    if (e.dataTransfer.files.length > 0) {
      void handleFiles(e.dataTransfer.files);
    }
  };

  const docs = [...docsSinAsignar, ...docsAsignados];

  return (
    <div className="bg-white rounded-lg border border-gray-200 p-4 h-full overflow-y-auto">
      <h2 className="text-sm font-semibold text-gray-800 mb-3">Documentos</h2>

      {/* Selector de tipo + drop zone */}
      <div className="mb-3">
        <label className="block text-xs font-medium text-gray-600 mb-1">Tipo del próximo upload</label>
        <select
          value={tipoSeleccionado}
          onChange={(e) => setTipoSeleccionado(e.target.value as TipoDocSoportado)}
          className="w-full px-3 py-1.5 border border-gray-300 rounded-lg text-sm bg-white mb-2"
        >
          {TIPOS_V0.map((t) => (
            <option key={t.value} value={t.value}>{t.label}</option>
          ))}
        </select>
      </div>

      <div
        onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
        onDragLeave={() => setDragging(false)}
        onDrop={handleDrop}
        onClick={() => fileInputRef.current?.click()}
        className={`border-2 border-dashed rounded-lg p-6 text-center cursor-pointer transition-colors ${
          dragging
            ? 'border-inyecta-500 bg-inyecta-50'
            : 'border-gray-300 hover:border-inyecta-400 hover:bg-gray-50'
        }`}
      >
        <input
          ref={fileInputRef}
          type="file"
          multiple
          accept=".pdf,.jpg,.jpeg,.png,.webp"
          onChange={(e) => e.target.files && handleFiles(e.target.files)}
          className="hidden"
        />
        {uploading ? (
          <>
            <Loader2 size={24} className="mx-auto text-inyecta-600 animate-spin mb-2" />
            <p className="text-sm text-gray-700">Subiendo y extrayendo...</p>
            <p className="text-xs text-gray-400 mt-1">Esto puede tardar unos segundos por archivo.</p>
          </>
        ) : (
          <>
            <Upload size={24} className="mx-auto text-gray-400 mb-2" />
            <p className="text-sm font-medium text-gray-700">
              Arrastra archivos aquí o haz clic
            </p>
            <p className="text-xs text-gray-500 mt-1">
              PDF / JPG / PNG · máx 10 MB cada uno
            </p>
          </>
        )}
      </div>

      {/* Lista de docs */}
      <div className="mt-4">
        <div className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-2">
          Subidos ({docs.length})
        </div>
        {docs.length === 0 && (
          <p className="text-xs text-gray-400 italic">Aún no has subido nada.</p>
        )}
        <div className="space-y-2">
          {docs.map((d) => (
            <DocRow
              key={d.id}
              doc={d}
              actores={actores}
              onReassign={onReassign}
              onChangeTipo={onChangeTipo}
              onDelete={onDelete}
            />
          ))}
        </div>
      </div>
    </div>
  );
}
