/**
 * DocumentDropzone — columna central. Drop zone + lista de docs
 * subidos al draft.
 *
 * El selector "Tipo del próximo upload" y el re-etiquetado por doc se
 * llenan desde el catálogo del expediente (server-driven). El catálogo
 * se organiza por sección (optgroups):
 *
 *   - Documentos del involucrado seleccionado (filtrado por actor).
 *   - Operación, Bien arrendado, Formalización (secciones compartidas;
 *     incluyen los documentos que la operación genera de forma natural,
 *     marcados como opcionales).
 *   - OTRO (escape hatch para docs fuera del catálogo).
 *
 * Si el catálogo aún no cargó, cae al subset mínimo (INE/CSF/
 * COMPROBANTE/OTRO) para que la UI siga funcionando.
 */
import { useState, useRef, useMemo } from 'react';
import { Upload, FileText, Loader2, Trash2, AlertTriangle } from 'lucide-react';
import type {
  OperationDraftActor,
  OperationDraftDoc,
  CatalogoResponse,
  CatalogoDocItem,
  CatalogoSeccion,
} from './types';

interface Props {
  docsAsignados: OperationDraftDoc[];
  docsSinAsignar: OperationDraftDoc[];
  actores: OperationDraftActor[];
  catalogo: CatalogoResponse | null;
  tipoTitular: 'PFAE' | 'PM';
  selectedActor: OperationDraftActor | null;
  onUpload: (file: File, tipo: string) => Promise<void>;
  onReassign: (docId: string, actorId: string | null) => Promise<void>;
  onChangeTipo: (docId: string, tipo: string) => Promise<void>;
  onDelete: (docId: string) => Promise<void>;
}

// Colores para los tipos auto-extraíbles; el resto va en gris.
const COLOR_POR_TIPO: Record<string, { bg: string; text: string }> = {
  INE:                   { bg: 'bg-emerald-100', text: 'text-emerald-700' },
  CSF:                   { bg: 'bg-blue-100',    text: 'text-blue-700' },
  COMPROBANTE_DOMICILIO: { bg: 'bg-amber-100',   text: 'text-amber-700' },
};
const COLOR_DEFAULT = { bg: 'bg-gray-100', text: 'text-gray-700' };

// Fallback mínimo si el catálogo no cargó.
const FALLBACK_ITEMS: CatalogoDocItem[] = [
  { clave: 'INE',                   etiqueta: 'INE',                   opcional: false },
  { clave: 'CSF',                   etiqueta: 'CSF',                   opcional: false },
  { clave: 'COMPROBANTE_DOMICILIO', etiqueta: 'Comprobante domicilio', opcional: false },
];

/** Sección de catálogo de la persona según el rol/subtipo del actor. */
function seccionPersonaParaActor(actor: OperationDraftActor): CatalogoSeccion {
  switch (actor.rol) {
    case 'TITULAR':
      return actor.subtipo === 'PM' ? 'SOLICITANTE_PM' : 'SOLICITANTE_PFAE';
    case 'REPRESENTANTE_LEGAL':
      return 'REPRESENTANTE_LEGAL';
    case 'SOCIO':
      return 'PRINCIPAL_ACCIONISTA';
    case 'AVAL':
      return actor.subtipo === 'PM' ? 'AVAL_PM' : 'AVAL_PF';
    default:
      return 'SOLICITANTE_PFAE';
  }
}

interface Optgroup {
  label: string;
  items: CatalogoDocItem[];
}

/**
 * Arma los optgroups del dropdown: la sección del involucrado
 * seleccionado (si hay) + las secciones compartidas. Si no hay
 * catálogo, devuelve el fallback mínimo.
 */
function construirOptgroups(
  catalogo: CatalogoResponse | null,
  tipoTitular: 'PFAE' | 'PM',
  selectedActor: OperationDraftActor | null,
): Optgroup[] {
  if (!catalogo) {
    return [{ label: 'Documentos', items: FALLBACK_ITEMS }];
  }
  const c = catalogo.catalogos;
  const groups: Optgroup[] = [];

  if (selectedActor) {
    const sec = seccionPersonaParaActor(selectedActor);
    groups.push({ label: `Del involucrado: ${selectedActor.nombre}`, items: c[sec] });
  }

  groups.push({
    label: 'Operación',
    items: tipoTitular === 'PM' ? c.OPERACION_PM : c.OPERACION_PFAE,
  });
  groups.push({ label: 'Bien arrendado', items: c.BIEN_ARRENDADO });
  groups.push({ label: 'Formalización', items: c.FORMALIZACION });

  return groups;
}

/** Lista plana de todas las claves del catálogo (para re-etiquetar). */
function todasLasClaves(
  catalogo: CatalogoResponse | null,
): CatalogoDocItem[] {
  if (!catalogo) return FALLBACK_ITEMS;
  const vistos = new Map<string, CatalogoDocItem>();
  for (const seccion of Object.values(catalogo.catalogos)) {
    for (const item of seccion) {
      if (!vistos.has(item.clave)) vistos.set(item.clave, item);
    }
  }
  return Array.from(vistos.values());
}

function DocRow({
  doc,
  actores,
  etiquetaPorClave,
  opcionesTipo,
  onReassign,
  onChangeTipo,
  onDelete,
}: {
  doc: OperationDraftDoc;
  actores: OperationDraftActor[];
  etiquetaPorClave: Map<string, string>;
  opcionesTipo: CatalogoDocItem[];
  onReassign: (docId: string, actorId: string | null) => Promise<void>;
  onChangeTipo: (docId: string, tipo: string) => Promise<void>;
  onDelete: (docId: string) => Promise<void>;
}) {
  const color = COLOR_POR_TIPO[doc.tipoDocumento] ?? COLOR_DEFAULT;
  const label = etiquetaPorClave.get(doc.tipoDocumento)
    ?? (doc.tipoDocumento === 'OTRO' ? 'Otro' : doc.tipoDocumento);
  const sinAsignar = !doc.actorId;
  const conError = !!doc.extraccionError;
  const warn = sinAsignar || conError;

  // Si el tipo actual no está en el catálogo (ej. 'OTRO' o legacy),
  // lo agregamos a las opciones para que el <select> sea controlado.
  const tipoEnOpciones = opcionesTipo.some((o) => o.clave === doc.tipoDocumento);

  return (
    <div className={`flex items-center gap-3 p-2.5 rounded border ${
      warn ? 'border-amber-300 bg-amber-50' : 'border-gray-200 hover:bg-gray-50'
    }`}>
      {warn ? <AlertTriangle size={18} className="text-amber-600 shrink-0" /> : <FileText size={18} className="text-gray-400 shrink-0" />}
      <div className="flex-1 min-w-0">
        <div className="text-sm font-medium text-gray-900 truncate">{doc.nombreArchivo}</div>
        <div className="flex items-center gap-1.5 mt-0.5">
          <span className={`text-[10px] px-1.5 py-0.5 rounded ${color.bg} ${color.text}`}>
            {label}
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
        className="text-xs border border-gray-300 rounded px-1.5 py-1 max-w-[140px] bg-white"
      >
        {!tipoEnOpciones && (
          <option value={doc.tipoDocumento}>{label}</option>
        )}
        {opcionesTipo.map((t) => (
          <option key={t.clave} value={t.clave}>{t.etiqueta}{t.opcional ? ' (opc.)' : ''}</option>
        ))}
        <option value="OTRO">Otro</option>
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
  docsAsignados, docsSinAsignar, actores, catalogo, tipoTitular, selectedActor,
  onUpload, onReassign, onChangeTipo, onDelete,
}: Props) {
  const [dragging, setDragging] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [tipoSeleccionado, setTipoSeleccionado] = useState<string>('INE');
  const fileInputRef = useRef<HTMLInputElement>(null);

  const optgroups = useMemo(
    () => construirOptgroups(catalogo, tipoTitular, selectedActor),
    [catalogo, tipoTitular, selectedActor],
  );
  const opcionesTipo = useMemo(() => todasLasClaves(catalogo), [catalogo]);
  const etiquetaPorClave = useMemo(() => {
    const m = new Map<string, string>();
    for (const o of opcionesTipo) m.set(o.clave, o.etiqueta);
    return m;
  }, [opcionesTipo]);

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
          onChange={(e) => setTipoSeleccionado(e.target.value)}
          className="w-full px-3 py-1.5 border border-gray-300 rounded-lg text-sm bg-white mb-2"
        >
          {optgroups.map((g) => (
            <optgroup key={g.label} label={g.label}>
              {g.items.map((t) => (
                <option key={`${g.label}:${t.clave}`} value={t.clave}>
                  {t.etiqueta}{t.opcional ? ' (opc.)' : ''}
                </option>
              ))}
            </optgroup>
          ))}
          <option value="OTRO">Otro</option>
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
              etiquetaPorClave={etiquetaPorClave}
              opcionesTipo={opcionesTipo}
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
