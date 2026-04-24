/**
 * CargarSolicitud.tsx — Flujo de alta desde una Solicitud de Arrendamiento en PDF.
 *
 * Replica el patrón de ExtractPDFButton (INE, CSF) pero sobre el tipo
 * SOLICITUD: una sola pasada de visión extrae ~80 campos del formulario
 * completo; el usuario revisa/edita; al confirmar, el cliente emite 2
 * POSTs (clients + contracts) más uno adicional por cada obligado
 * solidario (expediente/actores AVAL).
 *
 * Estados:
 *   'upload'   → zona de drop + botón "Extraer". Sin datos.
 *   'review'   → cards editables por sección. Permite volver a subir.
 *   'creating' → se están ejecutando las 2+ llamadas; botones deshabilitados.
 *   'done'     → éxito: redirige a /contratos/:id (pestaña docs) en 2s.
 *   'error'    → fallo en creación; muestra detalle y deja re-intentar.
 *
 * Nota sobre errores parciales: si POST /clients funciona pero POST
 * /contracts falla, NO deshacemos la creación del cliente (sería
 * complejo y arriesga datos). Mostramos el mensaje y dejamos que el
 * usuario corrija y reintente el contrato manualmente desde la UI
 * tradicional — el cliente ya quedó listo en la BD.
 */
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Upload, FileText, Loader2, AlertTriangle, CheckCircle2,
  XCircle, Trash2, PlusCircle, ArrowRight, ArrowLeft,
} from 'lucide-react';
import api from '@/lib/api';
import { useExtractPDF, type ExtractResponse } from '@/hooks/useExtractPDF';
import {
  solicitudToClientPayload,
  solicitudToContractPayload,
  solicitudToAvalesPayloads,
} from '@/lib/solicitud/mappers';
import type {
  SolicitudData, TipoSolicitante, TipoArrendamiento,
  SolicitudObligado, SolicitudRefBancaria, SolicitudRefComercial,
} from '@/lib/solicitud/types';

type Stage = 'upload' | 'review' | 'creating' | 'done' | 'error';

interface CreationError {
  step: 'cliente' | 'contrato' | 'aval';
  message: string;
  /** Si el cliente ya se creó antes de fallar, lo guardamos para recuperar. */
  clientId?: string;
  avalIndex?: number;
}

export default function CargarSolicitud() {
  const navigate = useNavigate();
  const { extract, loading: extracting, error: extractError, reset: resetExtract } = useExtractPDF();

  const [stage, setStage] = useState<Stage>('upload');
  const [solicitud, setSolicitud] = useState<SolicitudData | null>(null);
  const [extractMeta, setExtractMeta] = useState<Pick<ExtractResponse, 'confidence' | 'provider' | 'warning'> | null>(null);
  const [creationError, setCreationError] = useState<CreationError | null>(null);
  const [createdContractId, setCreatedContractId] = useState<string | null>(null);

  const handleFile = async (file: File) => {
    setCreationError(null);
    const res = await extract(file, 'SOLICITUD');
    if (res) {
      setSolicitud(res.data as SolicitudData);
      setExtractMeta({ confidence: res.confidence, provider: res.provider, warning: res.warning });
      setStage('review');
    }
  };

  const reset = () => {
    resetExtract();
    setSolicitud(null);
    setExtractMeta(null);
    setCreationError(null);
    setCreatedContractId(null);
    setStage('upload');
  };

  const handleCreateAll = async () => {
    if (!solicitud) return;
    setStage('creating');
    setCreationError(null);

    // Paso 1: Cliente
    let clientId: string;
    try {
      const clientBody = solicitudToClientPayload(solicitud);
      const { data } = await api.post('/clients', clientBody);
      clientId = data.id;
    } catch (err) {
      setCreationError({ step: 'cliente', message: extractApiError(err) });
      setStage('error');
      return;
    }

    // Paso 2: Contrato
    let contractId: string;
    try {
      const contractBody = solicitudToContractPayload(solicitud, { clientId });
      const { data } = await api.post('/contracts', contractBody);
      contractId = data.id;
      setCreatedContractId(contractId);
    } catch (err) {
      setCreationError({ step: 'contrato', message: extractApiError(err), clientId });
      setStage('error');
      return;
    }

    // Paso 3: Avales (best-effort — si alguno falla, seguimos con los demás)
    const avales = solicitudToAvalesPayloads(solicitud, contractId);
    for (let i = 0; i < avales.length; i++) {
      try {
        await api.post('/expediente/actores', avales[i]);
      } catch (err) {
        // Reportamos el primero que falle. Los demás se quedan por crear
        // manualmente — no es crítico para que el contrato viva.
        setCreationError({
          step: 'aval', avalIndex: i,
          message: `No se pudo crear el aval #${i + 1}: ${extractApiError(err)}. El cliente y contrato SÍ se crearon.`,
          clientId,
        });
        // No return: avanzamos a 'done' pero mostramos el warning.
        break;
      }
    }

    setStage('done');
    // Redirige tras un breve momento para que el usuario vea el mensaje.
    setTimeout(() => navigate(`/contratos/${contractId}`), 1500);
  };

  return (
    <div className="max-w-5xl mx-auto">
      {/* Header */}
      <div className="mb-6">
        <h1 className="text-xl font-bold text-gray-900">Cargar Solicitud de Arrendamiento</h1>
        <p className="text-sm text-gray-500 mt-1">
          Sube la solicitud en PDF y el sistema extrae toda la información. Revisa los datos
          y crea el cliente + contrato en un solo paso.
        </p>
      </div>

      <StageIndicator stage={stage} />

      {stage === 'upload' && (
        <UploadZone
          onFile={handleFile}
          loading={extracting}
          error={extractError}
        />
      )}

      {(stage === 'review' || stage === 'creating' || stage === 'error') && solicitud && (
        <div className="space-y-4">
          {extractMeta && (
            <ExtractionBadge {...extractMeta} />
          )}
          {creationError && (
            <ErrorBanner err={creationError} />
          )}

          <SolicitudReview
            value={solicitud}
            onChange={setSolicitud}
            disabled={stage === 'creating'}
          />

          <div className="flex items-center justify-between pt-4 border-t border-gray-200">
            <button
              onClick={reset}
              disabled={stage === 'creating'}
              className="inline-flex items-center gap-2 px-4 py-2 text-sm text-gray-600 hover:text-gray-800 disabled:opacity-50"
            >
              <ArrowLeft size={16} /> Volver a subir
            </button>
            <button
              onClick={handleCreateAll}
              disabled={stage === 'creating'}
              className="inline-flex items-center gap-2 px-5 py-2.5 bg-inyecta-700 text-white rounded-lg text-sm font-medium hover:bg-inyecta-800 disabled:bg-gray-300"
            >
              {stage === 'creating' ? (
                <><Loader2 size={16} className="animate-spin" /> Creando...</>
              ) : (
                <>Crear cliente y contrato <ArrowRight size={16} /></>
              )}
            </button>
          </div>
        </div>
      )}

      {stage === 'done' && (
        <div className="mt-8 bg-emerald-50 border border-emerald-200 rounded-xl p-6 text-center">
          <CheckCircle2 className="mx-auto text-emerald-600 mb-2" size={32} />
          <p className="text-emerald-900 font-medium">Cliente y contrato creados correctamente</p>
          <p className="text-sm text-emerald-700 mt-1">
            Redirigiendo al detalle del contrato{createdContractId ? ` (${createdContractId.slice(0, 8)}…)` : ''}…
          </p>
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────
// Subcomponentes
// ─────────────────────────────────────────────────────────────────

function StageIndicator({ stage }: { stage: Stage }) {
  const steps = [
    { id: 'upload',   label: 'Subir PDF' },
    { id: 'review',   label: 'Revisar datos' },
    { id: 'creating', label: 'Crear en sistema' },
  ];
  const currentIdx =
    stage === 'upload' ? 0 :
    stage === 'review' || stage === 'error' ? 1 :
    2;
  return (
    <div className="flex items-center gap-2 mb-6">
      {steps.map((s, i) => {
        const active = i === currentIdx;
        const done = i < currentIdx || stage === 'done';
        return (
          <div key={s.id} className="flex items-center gap-2">
            <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-medium ${
              done ? 'bg-inyecta-700 text-white'
              : active ? 'bg-inyecta-100 text-inyecta-700 ring-2 ring-inyecta-300'
              : 'bg-gray-100 text-gray-400'
            }`}>
              {done ? '✓' : i + 1}
            </div>
            <span className={`text-sm ${active ? 'text-gray-900 font-medium' : done ? 'text-gray-600' : 'text-gray-400'}`}>
              {s.label}
            </span>
            {i < steps.length - 1 && <span className="mx-2 text-gray-300">—</span>}
          </div>
        );
      })}
    </div>
  );
}

function UploadZone({
  onFile, loading, error,
}: { onFile: (f: File) => void; loading: boolean; error: string | null }) {
  const [dragging, setDragging] = useState(false);

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragging(false);
    const file = e.dataTransfer.files?.[0];
    if (file) onFile(file);
  };

  return (
    <div>
      <label
        onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
        onDragLeave={() => setDragging(false)}
        onDrop={handleDrop}
        className={`block border-2 border-dashed rounded-xl p-12 text-center cursor-pointer transition-colors ${
          dragging ? 'border-inyecta-500 bg-inyecta-50'
          : loading ? 'border-inyecta-300 bg-inyecta-50/50'
          : 'border-gray-300 bg-gray-50 hover:border-inyecta-400 hover:bg-inyecta-50/30'
        }`}
      >
        <input
          type="file"
          accept=".pdf,.jpg,.jpeg,.png,.webp"
          className="hidden"
          disabled={loading}
          onChange={(e) => {
            const f = e.target.files?.[0];
            e.target.value = '';
            if (f) onFile(f);
          }}
        />
        {loading ? (
          <>
            <Loader2 size={40} className="mx-auto text-inyecta-600 animate-spin mb-3" />
            <p className="text-sm text-gray-700 font-medium">Analizando la solicitud...</p>
            <p className="text-xs text-gray-500 mt-1">Esto puede tardar hasta un minuto.</p>
          </>
        ) : (
          <>
            <Upload size={40} className="mx-auto text-gray-400 mb-3" />
            <p className="text-sm text-gray-700 font-medium">
              Arrastra la Solicitud de Arrendamiento aquí, o haz clic para elegir el archivo
            </p>
            <p className="text-xs text-gray-500 mt-1">PDF, JPG, PNG o WEBP · máx. 10 MB</p>
          </>
        )}
      </label>

      {error && (
        <div className="mt-3 flex items-start gap-2 px-3 py-2 rounded-lg bg-red-50 border border-red-200 text-sm text-red-800">
          <XCircle size={16} className="mt-0.5 flex-shrink-0" /> {error}
        </div>
      )}
    </div>
  );
}

function ExtractionBadge({
  confidence, provider, warning,
}: { confidence: number; provider: string; warning?: string }) {
  const pct = Math.round(confidence * 100);
  const low = pct < 70;
  return (
    <div className={`flex items-start gap-2 px-3 py-2 rounded-lg border text-sm ${
      low ? 'bg-amber-50 border-amber-200 text-amber-900'
      : 'bg-green-50 border-green-200 text-green-900'
    }`}>
      {low ? <AlertTriangle size={16} className="mt-0.5" /> : <CheckCircle2 size={16} className="mt-0.5" />}
      <div>
        <strong>Datos extraídos</strong> — confianza {pct}% · proveedor {provider}
        {warning && <div className="mt-1 text-xs">{warning}</div>}
      </div>
    </div>
  );
}

function ErrorBanner({ err }: { err: CreationError }) {
  return (
    <div className="flex items-start gap-2 px-3 py-2 rounded-lg bg-red-50 border border-red-200 text-sm text-red-800">
      <XCircle size={16} className="mt-0.5 flex-shrink-0" />
      <div>
        <strong>Error al crear {err.step}</strong>
        <div className="mt-0.5">{err.message}</div>
        {err.clientId && (
          <div className="mt-1 text-xs text-red-700">
            El cliente ya se creó con ID <code>{err.clientId.slice(0, 8)}…</code> — puedes reintentar el contrato ajustando los datos.
          </div>
        )}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────
// Review — cards editables por sección
// ─────────────────────────────────────────────────────────────────
function SolicitudReview({
  value, onChange, disabled,
}: { value: SolicitudData; onChange: (v: SolicitudData) => void; disabled: boolean }) {
  const update = (patch: Partial<SolicitudData>) => onChange({ ...value, ...patch });

  return (
    <div className="space-y-4">
      {/* Tipo + Operación + Bien */}
      <Card title="Operación y Bien">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <SelectField label="Tipo de solicitante" value={value.tipoSolicitante ?? ''} disabled={disabled}
            options={[['PFAE', 'Persona Física con Actividad Empresarial'], ['PM', 'Persona Moral']]}
            onChange={(v) => update({ tipoSolicitante: (v || null) as TipoSolicitante | null })}
          />
          <SelectField label="Tipo de arrendamiento" value={value.operacion?.tipoArrendamiento ?? ''} disabled={disabled}
            options={[['FINANCIERO', 'Financiero'], ['PURO', 'Puro']]}
            onChange={(v) => update({ operacion: { ...value.operacion, tipoArrendamiento: (v || null) as TipoArrendamiento | null } })}
          />
          <NumberField label="Plazo (meses)" value={value.operacion?.plazoMeses ?? null} disabled={disabled}
            onChange={(v) => update({ operacion: { ...value.operacion, plazoMeses: v } })}
          />
          <TextField label="Destino del bien" value={value.operacion?.destino ?? ''} disabled={disabled}
            onChange={(v) => update({ operacion: { ...value.operacion, destino: v || null } })}
          />
        </div>
        <div className="border-t border-gray-100 my-4" />
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <TextField label="Descripción del bien" value={value.bien?.descripcion ?? ''} disabled={disabled}
            onChange={(v) => update({ bien: { ...value.bien, descripcion: v || null } })}
          />
          <NumberField label="Valor con IVA" value={value.bien?.valorConIVA ?? null} disabled={disabled}
            onChange={(v) => update({ bien: { ...value.bien, valorConIVA: v } })}
          />
          <TextField label="Marca" value={value.bien?.marca ?? ''} disabled={disabled}
            onChange={(v) => update({ bien: { ...value.bien, marca: v || null } })}
          />
          <TextField label="Modelo" value={value.bien?.modelo ?? ''} disabled={disabled}
            onChange={(v) => update({ bien: { ...value.bien, modelo: v || null } })}
          />
          <NumberField label="Año" value={value.bien?.anio ?? null} disabled={disabled}
            onChange={(v) => update({ bien: { ...value.bien, anio: v } })}
          />
          <TextField label="Nº de serie" value={value.bien?.numSerie ?? ''} disabled={disabled}
            onChange={(v) => update({ bien: { ...value.bien, numSerie: v || null } })}
          />
          <TextField label="Proveedor" value={value.bien?.proveedor ?? ''} disabled={disabled}
            onChange={(v) => update({ bien: { ...value.bien, proveedor: v || null } })}
          />
          <TextField label="RFC proveedor" value={value.bien?.rfcProveedor ?? ''} disabled={disabled}
            onChange={(v) => update({ bien: { ...value.bien, rfcProveedor: v || null } })}
          />
        </div>
      </Card>

      {/* Solicitante PFAE o PM */}
      {value.tipoSolicitante === 'PFAE' && (
        <Card title="Solicitante (PFAE)">
          <GenericObjectEditor
            obj={value.solicitantePFAE ?? {}}
            onChange={(o) => update({ solicitantePFAE: o })}
            disabled={disabled}
            fields={PFAE_FIELDS}
          />
        </Card>
      )}

      {value.tipoSolicitante === 'PM' && (
        <>
          <Card title="Solicitante (Persona Moral)">
            <GenericObjectEditor
              obj={value.solicitantePM ?? {}}
              onChange={(o) => update({ solicitantePM: o })}
              disabled={disabled}
              fields={PM_FIELDS}
            />
          </Card>
          <Card title="Representante Legal">
            <GenericObjectEditor
              obj={value.representanteLegal ?? {}}
              onChange={(o) => update({ representanteLegal: o })}
              disabled={disabled}
              fields={REP_LEGAL_FIELDS}
            />
          </Card>
        </>
      )}

      {value.tipoSolicitante === 'PFAE' && value.conyuge && (
        <Card title="Cónyuge">
          <GenericObjectEditor
            obj={value.conyuge}
            onChange={(o) => update({ conyuge: o })}
            disabled={disabled}
            fields={CONYUGE_FIELDS}
          />
        </Card>
      )}

      <Card title="Perfil Transaccional">
        <GenericObjectEditor
          obj={value.perfilTransaccional ?? {}}
          onChange={(o) => update({ perfilTransaccional: o })}
          disabled={disabled}
          fields={PERFIL_FIELDS}
        />
      </Card>

      <Card title="Declaración PEP">
        <GenericObjectEditor
          obj={value.pep ?? {}}
          onChange={(o) => update({ pep: o })}
          disabled={disabled}
          fields={PEP_FIELDS}
        />
      </Card>

      <Card title={`Referencias Bancarias (${value.referenciasBancarias?.length ?? 0})`}>
        <ArrayEditor<SolicitudRefBancaria>
          items={value.referenciasBancarias ?? []}
          onChange={(items) => update({ referenciasBancarias: items })}
          disabled={disabled}
          fields={REF_BANCARIA_FIELDS}
          emptyFactory={() => ({ banco: '', tipoCuenta: '', numeroCuenta: '', antiguedad: '' })}
          labelFor={(it) => it.banco || 'Sin banco'}
        />
      </Card>

      <Card title={`Referencias Comerciales (${value.referenciasComerciales?.length ?? 0})`}>
        <ArrayEditor<SolicitudRefComercial>
          items={value.referenciasComerciales ?? []}
          onChange={(items) => update({ referenciasComerciales: items })}
          disabled={disabled}
          fields={REF_COMERCIAL_FIELDS}
          emptyFactory={() => ({ nombre: '', giro: '', telefono: '', antiguedad: '' })}
          labelFor={(it) => it.nombre || 'Sin nombre'}
        />
      </Card>

      <Card title={`Obligados Solidarios (${value.obligadosSolidarios?.length ?? 0})`}>
        <ArrayEditor<SolicitudObligado>
          items={value.obligadosSolidarios ?? []}
          onChange={(items) => update({ obligadosSolidarios: items })}
          disabled={disabled}
          fields={OBLIGADO_FIELDS}
          emptyFactory={() => ({ tipo: 'PF', nombre: '', apellidoPaterno: '', apellidoMaterno: '', rfc: '' })}
          labelFor={(it) =>
            it.tipo === 'PM' ? (it.razonSocial || 'Sin razón social')
            : [it.nombre, it.apellidoPaterno].filter(Boolean).join(' ') || 'Sin nombre'
          }
        />
      </Card>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────
// Controles genéricos de formulario
// ─────────────────────────────────────────────────────────────────
function Card({ title, children }: { title: string; children: React.ReactNode }) {
  const [open, setOpen] = useState(true);
  return (
    <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="w-full flex items-center justify-between px-4 py-3 bg-gray-50 hover:bg-gray-100 transition-colors"
      >
        <span className="text-sm font-semibold text-gray-900 flex items-center gap-2">
          <FileText size={14} className="text-gray-400" /> {title}
        </span>
        <span className="text-xs text-gray-500">{open ? '▲' : '▼'}</span>
      </button>
      {open && <div className="p-4">{children}</div>}
    </div>
  );
}

function TextField({ label, value, onChange, disabled }: {
  label: string; value: string; onChange: (v: string) => void; disabled: boolean;
}) {
  return (
    <label className="block">
      <span className="block text-xs font-medium text-gray-600 mb-1">{label}</span>
      <input
        type="text"
        value={value}
        disabled={disabled}
        onChange={(e) => onChange(e.target.value)}
        className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-inyecta-500 focus:border-inyecta-500 outline-none disabled:bg-gray-50"
      />
    </label>
  );
}

function NumberField({ label, value, onChange, disabled }: {
  label: string; value: number | null; onChange: (v: number | null) => void; disabled: boolean;
}) {
  return (
    <label className="block">
      <span className="block text-xs font-medium text-gray-600 mb-1">{label}</span>
      <input
        type="number"
        value={value ?? ''}
        disabled={disabled}
        onChange={(e) => {
          const raw = e.target.value;
          onChange(raw === '' ? null : Number(raw));
        }}
        className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-inyecta-500 focus:border-inyecta-500 outline-none disabled:bg-gray-50"
      />
    </label>
  );
}

function SelectField({ label, value, options, onChange, disabled }: {
  label: string; value: string; options: [string, string][]; onChange: (v: string) => void; disabled: boolean;
}) {
  return (
    <label className="block">
      <span className="block text-xs font-medium text-gray-600 mb-1">{label}</span>
      <select
        value={value}
        disabled={disabled}
        onChange={(e) => onChange(e.target.value)}
        className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-inyecta-500 focus:border-inyecta-500 outline-none disabled:bg-gray-50"
      >
        <option value="">— seleccionar —</option>
        {options.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
      </select>
    </label>
  );
}

function BoolField({ label, value, onChange, disabled }: {
  label: string; value: boolean | null; onChange: (v: boolean | null) => void; disabled: boolean;
}) {
  return (
    <label className="block">
      <span className="block text-xs font-medium text-gray-600 mb-1">{label}</span>
      <select
        value={value === null || value === undefined ? '' : value ? 'true' : 'false'}
        disabled={disabled}
        onChange={(e) => {
          const v = e.target.value;
          onChange(v === '' ? null : v === 'true');
        }}
        className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-inyecta-500 focus:border-inyecta-500 outline-none disabled:bg-gray-50"
      >
        <option value="">—</option>
        <option value="true">Sí</option>
        <option value="false">No</option>
      </select>
    </label>
  );
}

// ─────────────────────────────────────────────────────────────────
// Editor genérico de objetos + arrays
// ─────────────────────────────────────────────────────────────────
type FieldKind = 'text' | 'number' | 'bool' | 'select';
interface FieldSpec {
  key: string;
  label: string;
  kind: FieldKind;
  /** Para kind='select': opciones [value, label]. */
  options?: [string, string][];
}

/**
 * GenericObjectEditor — editor tabular sobre un objeto parcial.
 *
 * Usamos `T extends object` (no `Record<string, unknown>`) para poder
 * aceptar las interfaces tipadas del modelo (SolicitudPFAE, etc.) que
 * no tienen index signature. Internamente accedemos a `obj` vía un
 * cast a `Record<string, unknown>` porque los specs usan claves
 * dinámicas.
 */
function GenericObjectEditor<T extends object>({
  obj, onChange, fields, disabled,
}: { obj: T; onChange: (o: T) => void; fields: FieldSpec[]; disabled: boolean }) {
  const set = (k: string, v: unknown) => {
    onChange({ ...obj, [k]: v } as T);
  };
  const bag = obj as Record<string, unknown>;
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
      {fields.map((f) => {
        const v = bag[f.key];
        if (f.kind === 'text') {
          return <TextField key={f.key} label={f.label} disabled={disabled}
            value={(v as string | null | undefined) ?? ''}
            onChange={(val) => set(f.key, val || null)} />;
        }
        if (f.kind === 'number') {
          return <NumberField key={f.key} label={f.label} disabled={disabled}
            value={(v as number | null | undefined) ?? null}
            onChange={(val) => set(f.key, val)} />;
        }
        if (f.kind === 'bool') {
          return <BoolField key={f.key} label={f.label} disabled={disabled}
            value={(v as boolean | null | undefined) ?? null}
            onChange={(val) => set(f.key, val)} />;
        }
        return <SelectField key={f.key} label={f.label} disabled={disabled}
          value={(v as string | null | undefined) ?? ''}
          options={f.options ?? []}
          onChange={(val) => set(f.key, val || null)} />;
      })}
    </div>
  );
}

function ArrayEditor<T extends object>({
  items, onChange, fields, disabled, emptyFactory, labelFor,
}: {
  items: T[];
  onChange: (items: T[]) => void;
  fields: FieldSpec[];
  disabled: boolean;
  emptyFactory: () => T;
  labelFor: (item: T) => string;
}) {
  const add = () => onChange([...items, emptyFactory()]);
  const remove = (i: number) => onChange(items.filter((_, idx) => idx !== i));
  const updateAt = (i: number, newItem: T) => {
    const next = [...items];
    next[i] = newItem;
    onChange(next);
  };

  return (
    <div className="space-y-3">
      {items.length === 0 && (
        <p className="text-sm text-gray-400 italic">Sin registros.</p>
      )}
      {items.map((it, i) => (
        <div key={i} className="p-3 border border-gray-200 rounded-lg bg-gray-50">
          <div className="flex items-center justify-between mb-3">
            <span className="text-xs font-medium text-gray-700">#{i + 1} · {labelFor(it)}</span>
            <button
              type="button"
              onClick={() => remove(i)}
              disabled={disabled}
              className="text-red-500 hover:text-red-700 disabled:opacity-50"
              title="Eliminar"
            >
              <Trash2 size={14} />
            </button>
          </div>
          <GenericObjectEditor obj={it} onChange={(o) => updateAt(i, o)} fields={fields} disabled={disabled} />
        </div>
      ))}
      <button
        type="button"
        onClick={add}
        disabled={disabled}
        className="inline-flex items-center gap-1 text-xs px-2.5 py-1.5 border border-inyecta-200 text-inyecta-700 rounded-lg hover:bg-inyecta-50 disabled:opacity-50"
      >
        <PlusCircle size={12} /> Agregar
      </button>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────
// Campos por sección (orden de presentación)
// ─────────────────────────────────────────────────────────────────
const DOMICILIO_FIELDS = [
  { key: 'calle',            label: 'Calle',                kind: 'text' as const },
  { key: 'numExterior',      label: 'Nº Exterior',          kind: 'text' as const },
  { key: 'numInterior',      label: 'Nº Interior',          kind: 'text' as const },
  { key: 'colonia',          label: 'Colonia',              kind: 'text' as const },
  { key: 'municipio',        label: 'Municipio',            kind: 'text' as const },
  { key: 'ciudad',           label: 'Ciudad',               kind: 'text' as const },
  { key: 'estado',           label: 'Estado',               kind: 'text' as const },
  { key: 'codigoPostal',     label: 'Código Postal',        kind: 'text' as const },
  { key: 'tipoInmueble',     label: 'Tipo inmueble',        kind: 'text' as const },
  { key: 'antiguedadDomicilio', label: 'Antigüedad',        kind: 'text' as const },
];

const PFAE_FIELDS: FieldSpec[] = [
  { key: 'nombre',              label: 'Nombre',               kind: 'text' },
  { key: 'apellidoPaterno',     label: 'Apellido paterno',     kind: 'text' },
  { key: 'apellidoMaterno',     label: 'Apellido materno',     kind: 'text' },
  { key: 'rfc',                 label: 'RFC',                  kind: 'text' },
  { key: 'curp',                label: 'CURP',                 kind: 'text' },
  { key: 'fechaNacimiento',     label: 'Fecha nacimiento',     kind: 'text' },
  { key: 'lugarNacimiento',     label: 'Lugar nacimiento',     kind: 'text' },
  { key: 'nacionalidad',        label: 'Nacionalidad',         kind: 'text' },
  { key: 'sexo',                label: 'Sexo',                 kind: 'select', options: [['H', 'Hombre'], ['M', 'Mujer']] },
  { key: 'estadoCivil',         label: 'Estado civil',         kind: 'text' },
  { key: 'regimenMatrimonial',  label: 'Régimen matrimonial',  kind: 'text' },
  { key: 'email',               label: 'Email',                kind: 'text' },
  { key: 'telefono',            label: 'Teléfono',             kind: 'text' },
  { key: 'celular',             label: 'Celular',              kind: 'text' },
  { key: 'actividad',           label: 'Actividad',            kind: 'text' },
  { key: 'giro',                label: 'Giro',                 kind: 'text' },
  { key: 'antiguedadNegocio',   label: 'Antigüedad negocio',   kind: 'text' },
  { key: 'ingresoMensual',      label: 'Ingreso mensual',      kind: 'number' },
  ...DOMICILIO_FIELDS,
];

const PM_FIELDS: FieldSpec[] = [
  { key: 'razonSocial',         label: 'Razón social',         kind: 'text' },
  { key: 'rfc',                 label: 'RFC',                  kind: 'text' },
  { key: 'fechaConstitucion',   label: 'Fecha constitución',   kind: 'text' },
  { key: 'giro',                label: 'Giro',                 kind: 'text' },
  { key: 'actividad',           label: 'Actividad',            kind: 'text' },
  { key: 'sector',              label: 'Sector',               kind: 'text' },
  { key: 'numeroEscritura',     label: 'Nº escritura',         kind: 'text' },
  { key: 'numeroNotaria',       label: 'Nº notaría',           kind: 'text' },
  { key: 'notario',             label: 'Notario',              kind: 'text' },
  { key: 'ciudadNotaria',       label: 'Ciudad notaría',       kind: 'text' },
  { key: 'capitalSocial',       label: 'Capital social',       kind: 'number' },
  { key: 'email',               label: 'Email',                kind: 'text' },
  { key: 'telefono',            label: 'Teléfono',             kind: 'text' },
  { key: 'ingresosAnuales',     label: 'Ingresos anuales',     kind: 'number' },
  { key: 'numEmpleados',        label: 'Nº empleados',         kind: 'number' },
  ...DOMICILIO_FIELDS,
];

const REP_LEGAL_FIELDS: FieldSpec[] = [
  { key: 'nombre',             label: 'Nombre',            kind: 'text' },
  { key: 'apellidoPaterno',    label: 'Apellido paterno',  kind: 'text' },
  { key: 'apellidoMaterno',    label: 'Apellido materno',  kind: 'text' },
  { key: 'rfc',                label: 'RFC',               kind: 'text' },
  { key: 'curp',               label: 'CURP',              kind: 'text' },
  { key: 'cargo',              label: 'Cargo',             kind: 'text' },
  { key: 'email',              label: 'Email',             kind: 'text' },
  { key: 'telefono',           label: 'Teléfono',          kind: 'text' },
  { key: 'numeroEscrituraPoder', label: 'Nº escritura poder', kind: 'text' },
  { key: 'fechaEscrituraPoder',  label: 'Fecha poder',       kind: 'text' },
  { key: 'numeroNotariaPoder',   label: 'Nº notaría poder',  kind: 'text' },
  { key: 'notarioPoder',         label: 'Notario poder',     kind: 'text' },
];

const CONYUGE_FIELDS: FieldSpec[] = [
  { key: 'nombre',           label: 'Nombre',           kind: 'text' },
  { key: 'apellidoPaterno',  label: 'Apellido paterno', kind: 'text' },
  { key: 'apellidoMaterno',  label: 'Apellido materno', kind: 'text' },
  { key: 'rfc',              label: 'RFC',              kind: 'text' },
  { key: 'curp',             label: 'CURP',             kind: 'text' },
  { key: 'ocupacion',        label: 'Ocupación',        kind: 'text' },
  { key: 'telefono',         label: 'Teléfono',         kind: 'text' },
];

const PERFIL_FIELDS: FieldSpec[] = [
  { key: 'montoMensualOperaciones',    label: 'Monto mensual operaciones',  kind: 'number' },
  { key: 'numeroOperacionesMensuales', label: 'Nº operaciones mensuales',   kind: 'number' },
  { key: 'origenRecursos',             label: 'Origen de recursos',         kind: 'text' },
  { key: 'destinoRecursos',            label: 'Destino de recursos',        kind: 'text' },
  { key: 'operaComercioExterior',      label: 'Opera comercio exterior',    kind: 'bool' },
  { key: 'paisesComercioExterior',     label: 'Países com. exterior',       kind: 'text' },
  { key: 'realizaDivisas',             label: 'Realiza op. en divisas',     kind: 'bool' },
  { key: 'realizaTransferenciasInternacionales', label: 'Transfers intl.',  kind: 'bool' },
];

const PEP_FIELDS: FieldSpec[] = [
  { key: 'esPEP',               label: '¿Es PEP?',              kind: 'bool' },
  { key: 'cargoPEP',            label: 'Cargo PEP',             kind: 'text' },
  { key: 'periodoPEP',          label: 'Periodo PEP',           kind: 'text' },
  { key: 'familiarPEP',         label: '¿Familiar PEP?',        kind: 'bool' },
  { key: 'nombreFamiliarPEP',   label: 'Nombre familiar PEP',   kind: 'text' },
  { key: 'parentescoPEP',       label: 'Parentesco',            kind: 'text' },
  { key: 'cargoFamiliarPEP',    label: 'Cargo del familiar',    kind: 'text' },
];

const REF_BANCARIA_FIELDS: FieldSpec[] = [
  { key: 'banco',         label: 'Banco',          kind: 'text' },
  { key: 'tipoCuenta',    label: 'Tipo cuenta',    kind: 'text' },
  { key: 'numeroCuenta',  label: 'Nº cuenta',      kind: 'text' },
  { key: 'antiguedad',    label: 'Antigüedad',     kind: 'text' },
];

const REF_COMERCIAL_FIELDS: FieldSpec[] = [
  { key: 'nombre',       label: 'Nombre',        kind: 'text' },
  { key: 'giro',         label: 'Giro',          kind: 'text' },
  { key: 'telefono',     label: 'Teléfono',      kind: 'text' },
  { key: 'email',        label: 'Email',         kind: 'text' },
  { key: 'antiguedad',   label: 'Antigüedad',    kind: 'text' },
  { key: 'lineaCredito', label: 'Línea crédito', kind: 'number' },
];

const OBLIGADO_FIELDS: FieldSpec[] = [
  { key: 'tipo',             label: 'Tipo', kind: 'select', options: [['PF', 'Persona Física'], ['PFAE', 'PF c/ Actividad Emp.'], ['PM', 'Persona Moral']] },
  { key: 'nombre',           label: 'Nombre',           kind: 'text' },
  { key: 'apellidoPaterno',  label: 'Apellido paterno', kind: 'text' },
  { key: 'apellidoMaterno',  label: 'Apellido materno', kind: 'text' },
  { key: 'razonSocial',      label: 'Razón social (PM)', kind: 'text' },
  { key: 'rfc',              label: 'RFC',              kind: 'text' },
  { key: 'curp',             label: 'CURP',             kind: 'text' },
  { key: 'fechaNacimiento',  label: 'Fecha nacimiento', kind: 'text' },
  { key: 'email',            label: 'Email',            kind: 'text' },
  { key: 'telefono',         label: 'Teléfono',         kind: 'text' },
  { key: 'relacion',         label: 'Relación',         kind: 'text' },
  { key: 'ocupacion',        label: 'Ocupación',        kind: 'text' },
  { key: 'ingresoMensual',   label: 'Ingreso mensual',  kind: 'number' },
];

// ─────────────────────────────────────────────────────────────────
// Utilidades
// ─────────────────────────────────────────────────────────────────
function extractApiError(err: unknown): string {
  const anyErr = err as {
    response?: { data?: { error?: { message?: string } | string } | unknown; status?: number };
    message?: string;
  };
  const data = anyErr.response?.data as { error?: { message?: string } | string } | undefined;
  if (data) {
    if (typeof data.error === 'string') return data.error;
    if (typeof data.error === 'object' && data.error?.message) return data.error.message;
  }
  return anyErr.message ?? 'Error desconocido';
}
