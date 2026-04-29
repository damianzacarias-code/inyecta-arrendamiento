/**
 * AvalesTab — Captura de Deudores Solidarios y/o Avalistas por contrato.
 *
 * Cláusulas relevantes:
 *   • PURO  § VIGÉSIMA TERCERA — Deudor Solidario y/o Avalista
 *   • FIN   § DÉCIMA QUINTA   — Deudor Solidario y/o Avalista
 *
 * El régimen matrimonial y los datos del cónyuge importan porque el
 * aval renuncia a la facultad de enajenar bienes — si está casado por
 * sociedad conyugal, el cónyuge co-grava su patrimonio.
 *
 * Operaciones soportadas:
 *   • Listar (GET /api/contracts/:id/avales)
 *   • Crear (POST), Editar (PATCH), Eliminar (DELETE)
 *
 * Diseño: cards expandibles con form inline (modo "edit" cuando se
 * abre el card), botones compactos, validación local mínima — el
 * server valida con Zod.
 */
import { useState, useEffect, useCallback } from 'react';
import api from '@/lib/api';
import { Plus, Edit2, Trash2, ChevronDown, ChevronRight, User, Building2, Save, X } from 'lucide-react';

interface Aval {
  id: string;
  orden: number;
  tipo: 'PFAE' | 'PM';
  nombre: string;
  apellidoPaterno?: string | null;
  apellidoMaterno?: string | null;
  rfc?: string | null;
  curp?: string | null;
  estadoCivil?: 'SOLTERO' | 'CASADO' | null;
  regimenMatrimonial?: 'SEPARACION_BIENES' | 'SOCIEDAD_CONYUGAL' | null;
  nombreConyuge?: string | null;
  rfcConyuge?: string | null;
  fechaNacimiento?: string | null;
  calle?: string | null;
  numExterior?: string | null;
  numInterior?: string | null;
  colonia?: string | null;
  municipio?: string | null;
  ciudad?: string | null;
  estado?: string | null;
  cp?: string | null;
  telefono?: string | null;
  email?: string | null;
  // PM
  razonSocial?: string | null;
  fechaConstitucion?: string | null;
  folioMercantil?: string | null;
  notarioConstNombre?: string | null;
  notarioConstNumero?: string | null;
  notarioConstLugar?: string | null;
  repLegalNombre?: string | null;
  repLegalRfc?: string | null;
  poderEscrituraNumero?: string | null;
  poderEscrituraFecha?: string | null;
  poderNotarioNombre?: string | null;
}

type AvalDraft = Partial<Aval>;

const EMPTY_DRAFT: AvalDraft = {
  tipo: 'PFAE',
  nombre: '',
};

interface Props {
  contractId: string;
}

function nombreAval(a: Aval): string {
  if (a.tipo === 'PM') return a.razonSocial || '(sin razón social)';
  return [a.nombre, a.apellidoPaterno, a.apellidoMaterno].filter(Boolean).join(' ').trim() || '(sin nombre)';
}

function fmtError(err: unknown): string {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const e = err as any;
  return e?.response?.data?.error?.message
      ?? e?.response?.data?.error
      ?? e?.message
      ?? 'Error desconocido';
}

export default function AvalesTab({ contractId }: Props) {
  const [avales, setAvales] = useState<Aval[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [openId, setOpenId] = useState<string | 'new' | null>(null);
  const [draft, setDraft] = useState<AvalDraft>(EMPTY_DRAFT);
  const [saving, setSaving] = useState(false);

  const reload = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await api.get(`/contracts/${contractId}/avales`);
      setAvales(res.data.avales || []);
    } catch (err) {
      setError(fmtError(err));
    } finally {
      setLoading(false);
    }
  }, [contractId]);

  useEffect(() => { void reload(); }, [reload]);

  const startEdit = (a: Aval) => {
    setOpenId(a.id);
    setDraft({ ...a });
  };

  const startNew = () => {
    setOpenId('new');
    setDraft({ ...EMPTY_DRAFT, orden: avales.length + 1 });
  };

  const cancel = () => {
    setOpenId(null);
    setDraft(EMPTY_DRAFT);
  };

  const save = async () => {
    setSaving(true);
    setError(null);
    try {
      // Limpieza: el server rechaza strings vacíos en algunos campos
      // (email validado, etc.). Convertimos '' → null.
      const payload: Record<string, unknown> = {};
      Object.entries(draft).forEach(([k, v]) => {
        payload[k] = v === '' ? null : v;
      });
      // No enviamos los campos generados por el server
      delete payload.id;
      delete payload.createdAt;
      delete payload.updatedAt;
      delete payload.contractId;

      if (openId === 'new') {
        await api.post(`/contracts/${contractId}/avales`, payload);
      } else {
        await api.patch(`/contracts/${contractId}/avales/${openId}`, payload);
      }
      cancel();
      await reload();
    } catch (err) {
      setError(fmtError(err));
    } finally {
      setSaving(false);
    }
  };

  const remove = async (id: string) => {
    if (!confirm('¿Eliminar este aval? Esta acción no se puede deshacer.')) return;
    try {
      await api.delete(`/contracts/${contractId}/avales/${id}`);
      await reload();
    } catch (err) {
      alert(fmtError(err));
    }
  };

  // Helper para inputs
  const set = <K extends keyof AvalDraft>(key: K, value: AvalDraft[K]) =>
    setDraft((d) => ({ ...d, [key]: value }));

  if (loading) return <div className="p-6 text-gray-500">Cargando avales…</div>;

  return (
    <div className="space-y-3">
      {error && (
        <div className="p-3 rounded bg-red-50 border border-red-200 text-sm text-red-700">{error}</div>
      )}

      <div className="flex items-center justify-between">
        <h3 className="text-sm font-bold text-gray-700">
          Avales / Deudores Solidarios ({avales.length})
        </h3>
        {openId !== 'new' && (
          <button
            onClick={startNew}
            className="flex items-center gap-1 px-3 py-1.5 bg-inyecta-600 hover:bg-inyecta-700 text-white rounded-lg text-xs font-medium"
          >
            <Plus size={12} /> Agregar aval
          </button>
        )}
      </div>

      {avales.length === 0 && openId !== 'new' && (
        <div className="p-6 bg-gray-50 border border-dashed border-gray-300 rounded-lg text-center text-sm text-gray-500">
          Aún no hay avales capturados. Los contratos exigen al menos uno (cláusula
          VIGÉSIMA TERCERA del PURO / DÉCIMA QUINTA del FIN).
        </div>
      )}

      {/* Card: nuevo aval */}
      {openId === 'new' && (
        <FormCard
          draft={draft}
          set={set}
          onCancel={cancel}
          onSave={save}
          saving={saving}
          isNew
        />
      )}

      {/* Lista de avales existentes */}
      {avales.map((a) => {
        const isOpen = openId === a.id;
        return (
          <div key={a.id} className="border border-gray-200 rounded-lg bg-white">
            <div className="flex items-center justify-between p-3">
              <button
                onClick={() => setOpenId(isOpen ? null : a.id)}
                className="flex items-center gap-2 text-left flex-1"
              >
                {isOpen ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                {a.tipo === 'PM' ? <Building2 size={14} className="text-indigo-500" /> : <User size={14} className="text-blue-500" />}
                <span className="text-sm font-medium text-gray-800">
                  Aval {a.orden}: {nombreAval(a)}
                </span>
                <span className="text-xs text-gray-500 ml-2">{a.rfc || ''}</span>
              </button>
              <div className="flex items-center gap-1">
                <button
                  onClick={() => startEdit(a)}
                  className="p-1.5 hover:bg-gray-100 rounded text-gray-600"
                  title="Editar"
                >
                  <Edit2 size={14} />
                </button>
                <button
                  onClick={() => void remove(a.id)}
                  className="p-1.5 hover:bg-red-50 rounded text-red-600"
                  title="Eliminar"
                >
                  <Trash2 size={14} />
                </button>
              </div>
            </div>
            {isOpen && openId === a.id && (
              <FormCard
                draft={draft}
                set={set}
                onCancel={cancel}
                onSave={save}
                saving={saving}
              />
            )}
          </div>
        );
      })}
    </div>
  );
}

// ────────────────────────────────────────────────────────────────────
// Form embebido
// ────────────────────────────────────────────────────────────────────

interface FormProps {
  draft: AvalDraft;
  set: <K extends keyof AvalDraft>(key: K, value: AvalDraft[K]) => void;
  onCancel: () => void;
  onSave: () => Promise<void> | void;
  saving: boolean;
  isNew?: boolean;
}

function FormCard({ draft, set, onCancel, onSave, saving, isNew }: FormProps) {
  const isPM = draft.tipo === 'PM';
  const isCasado = draft.estadoCivil === 'CASADO';

  return (
    <div className="border-t border-gray-200 p-4 bg-gray-50 space-y-3">
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        <Field label="Tipo" required>
          <select
            value={draft.tipo || 'PFAE'}
            onChange={(e) => set('tipo', e.target.value as 'PFAE' | 'PM')}
            className="px-2 py-1.5 border border-gray-300 rounded text-sm bg-white focus:outline-none focus:ring-1 focus:ring-inyecta-500"
          >
            <option value="PFAE">Persona Física</option>
            <option value="PM">Persona Moral</option>
          </select>
        </Field>
        <Field label="Orden">
          <input
            type="number"
            min={1}
            value={draft.orden ?? ''}
            onChange={(e) => set('orden', Number(e.target.value) || 1)}
            className="px-2 py-1.5 border border-gray-300 rounded text-sm focus:outline-none focus:ring-1 focus:ring-inyecta-500"
          />
        </Field>
        <Field label="RFC">
          <input
            value={draft.rfc || ''}
            onChange={(e) => set('rfc', e.target.value.toUpperCase())}
            className="px-2 py-1.5 border border-gray-300 rounded text-sm focus:outline-none focus:ring-1 focus:ring-inyecta-500"
            maxLength={13}
            placeholder="XAXX010101000"
          />
        </Field>
      </div>

      {isPM ? (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <Field label="Razón social" required>
            <input value={draft.razonSocial || ''} onChange={(e) => set('razonSocial', e.target.value)} className="px-2 py-1.5 border border-gray-300 rounded text-sm focus:outline-none focus:ring-1 focus:ring-inyecta-500" />
          </Field>
          <Field label="Folio Mercantil (FME)">
            <input value={draft.folioMercantil || ''} onChange={(e) => set('folioMercantil', e.target.value)} className="px-2 py-1.5 border border-gray-300 rounded text-sm focus:outline-none focus:ring-1 focus:ring-inyecta-500" />
          </Field>
          <Field label="Fecha de constitución">
            <input type="date" value={(draft.fechaConstitucion || '').slice(0, 10)} onChange={(e) => set('fechaConstitucion', e.target.value)} className="px-2 py-1.5 border border-gray-300 rounded text-sm focus:outline-none focus:ring-1 focus:ring-inyecta-500" />
          </Field>
          <Field label="Notario constitutivo (nombre)">
            <input value={draft.notarioConstNombre || ''} onChange={(e) => set('notarioConstNombre', e.target.value)} className="px-2 py-1.5 border border-gray-300 rounded text-sm focus:outline-none focus:ring-1 focus:ring-inyecta-500" />
          </Field>
          <Field label="Notaría número">
            <input value={draft.notarioConstNumero || ''} onChange={(e) => set('notarioConstNumero', e.target.value)} className="px-2 py-1.5 border border-gray-300 rounded text-sm focus:outline-none focus:ring-1 focus:ring-inyecta-500" />
          </Field>
          <Field label="Lugar de la notaría">
            <input value={draft.notarioConstLugar || ''} onChange={(e) => set('notarioConstLugar', e.target.value)} className="px-2 py-1.5 border border-gray-300 rounded text-sm focus:outline-none focus:ring-1 focus:ring-inyecta-500" />
          </Field>
          <Field label="Representante legal del aval (nombre)">
            <input value={draft.repLegalNombre || ''} onChange={(e) => set('repLegalNombre', e.target.value)} className="px-2 py-1.5 border border-gray-300 rounded text-sm focus:outline-none focus:ring-1 focus:ring-inyecta-500" />
          </Field>
          <Field label="RFC del representante">
            <input value={draft.repLegalRfc || ''} onChange={(e) => set('repLegalRfc', e.target.value.toUpperCase())} className="px-2 py-1.5 border border-gray-300 rounded text-sm focus:outline-none focus:ring-1 focus:ring-inyecta-500" />
          </Field>
          <Field label="Escritura del poder (número)">
            <input value={draft.poderEscrituraNumero || ''} onChange={(e) => set('poderEscrituraNumero', e.target.value)} className="px-2 py-1.5 border border-gray-300 rounded text-sm focus:outline-none focus:ring-1 focus:ring-inyecta-500" />
          </Field>
          <Field label="Fecha del poder">
            <input type="date" value={(draft.poderEscrituraFecha || '').slice(0, 10)} onChange={(e) => set('poderEscrituraFecha', e.target.value)} className="px-2 py-1.5 border border-gray-300 rounded text-sm focus:outline-none focus:ring-1 focus:ring-inyecta-500" />
          </Field>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <Field label="Nombre(s)" required>
            <input value={draft.nombre || ''} onChange={(e) => set('nombre', e.target.value)} className="px-2 py-1.5 border border-gray-300 rounded text-sm focus:outline-none focus:ring-1 focus:ring-inyecta-500" />
          </Field>
          <Field label="Apellido paterno">
            <input value={draft.apellidoPaterno || ''} onChange={(e) => set('apellidoPaterno', e.target.value)} className="px-2 py-1.5 border border-gray-300 rounded text-sm focus:outline-none focus:ring-1 focus:ring-inyecta-500" />
          </Field>
          <Field label="Apellido materno">
            <input value={draft.apellidoMaterno || ''} onChange={(e) => set('apellidoMaterno', e.target.value)} className="px-2 py-1.5 border border-gray-300 rounded text-sm focus:outline-none focus:ring-1 focus:ring-inyecta-500" />
          </Field>
          <Field label="CURP">
            <input value={draft.curp || ''} onChange={(e) => set('curp', e.target.value.toUpperCase())} className="px-2 py-1.5 border border-gray-300 rounded text-sm focus:outline-none focus:ring-1 focus:ring-inyecta-500" maxLength={18} />
          </Field>
          <Field label="Fecha de nacimiento">
            <input type="date" value={(draft.fechaNacimiento || '').slice(0, 10)} onChange={(e) => set('fechaNacimiento', e.target.value)} className="px-2 py-1.5 border border-gray-300 rounded text-sm focus:outline-none focus:ring-1 focus:ring-inyecta-500" />
          </Field>
          <Field label="Estado civil">
            <select value={draft.estadoCivil || ''} onChange={(e) => set('estadoCivil', (e.target.value || null) as 'SOLTERO' | 'CASADO' | null)} className="px-2 py-1.5 border border-gray-300 rounded text-sm bg-white focus:outline-none focus:ring-1 focus:ring-inyecta-500">
              <option value="">—</option>
              <option value="SOLTERO">Soltero/a</option>
              <option value="CASADO">Casado/a</option>
            </select>
          </Field>
          {isCasado && (
            <>
              <Field label="Régimen matrimonial" required>
                <select
                  value={draft.regimenMatrimonial || ''}
                  onChange={(e) => set('regimenMatrimonial', (e.target.value || null) as AvalDraft['regimenMatrimonial'])}
                  className="px-2 py-1.5 border border-gray-300 rounded text-sm bg-white focus:outline-none focus:ring-1 focus:ring-inyecta-500"
                >
                  <option value="">—</option>
                  <option value="SEPARACION_BIENES">Separación de bienes</option>
                  <option value="SOCIEDAD_CONYUGAL">Sociedad conyugal</option>
                </select>
              </Field>
              <Field label="Nombre del cónyuge">
                <input value={draft.nombreConyuge || ''} onChange={(e) => set('nombreConyuge', e.target.value)} className="px-2 py-1.5 border border-gray-300 rounded text-sm focus:outline-none focus:ring-1 focus:ring-inyecta-500" />
              </Field>
              <Field label="RFC del cónyuge">
                <input value={draft.rfcConyuge || ''} onChange={(e) => set('rfcConyuge', e.target.value.toUpperCase())} className="px-2 py-1.5 border border-gray-300 rounded text-sm focus:outline-none focus:ring-1 focus:ring-inyecta-500" maxLength={13} />
              </Field>
            </>
          )}
        </div>
      )}

      {/* Domicilio (común) */}
      <div className="pt-2 border-t border-gray-200">
        <p className="text-xs font-bold text-gray-600 mb-2 uppercase tracking-wide">Domicilio</p>
        <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
          <Field label="Calle">
            <input value={draft.calle || ''} onChange={(e) => set('calle', e.target.value)} className="px-2 py-1.5 border border-gray-300 rounded text-sm focus:outline-none focus:ring-1 focus:ring-inyecta-500" />
          </Field>
          <Field label="Núm. exterior">
            <input value={draft.numExterior || ''} onChange={(e) => set('numExterior', e.target.value)} className="px-2 py-1.5 border border-gray-300 rounded text-sm focus:outline-none focus:ring-1 focus:ring-inyecta-500" />
          </Field>
          <Field label="Núm. interior">
            <input value={draft.numInterior || ''} onChange={(e) => set('numInterior', e.target.value)} className="px-2 py-1.5 border border-gray-300 rounded text-sm focus:outline-none focus:ring-1 focus:ring-inyecta-500" />
          </Field>
          <Field label="Colonia">
            <input value={draft.colonia || ''} onChange={(e) => set('colonia', e.target.value)} className="px-2 py-1.5 border border-gray-300 rounded text-sm focus:outline-none focus:ring-1 focus:ring-inyecta-500" />
          </Field>
          <Field label="Municipio">
            <input value={draft.municipio || ''} onChange={(e) => set('municipio', e.target.value)} className="px-2 py-1.5 border border-gray-300 rounded text-sm focus:outline-none focus:ring-1 focus:ring-inyecta-500" />
          </Field>
          <Field label="Ciudad">
            <input value={draft.ciudad || ''} onChange={(e) => set('ciudad', e.target.value)} className="px-2 py-1.5 border border-gray-300 rounded text-sm focus:outline-none focus:ring-1 focus:ring-inyecta-500" />
          </Field>
          <Field label="Estado">
            <input value={draft.estado || ''} onChange={(e) => set('estado', e.target.value)} className="px-2 py-1.5 border border-gray-300 rounded text-sm focus:outline-none focus:ring-1 focus:ring-inyecta-500" />
          </Field>
          <Field label="C.P.">
            <input value={draft.cp || ''} onChange={(e) => set('cp', e.target.value)} className="px-2 py-1.5 border border-gray-300 rounded text-sm focus:outline-none focus:ring-1 focus:ring-inyecta-500" maxLength={10} />
          </Field>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3 pt-2 border-t border-gray-200">
        <Field label="Teléfono">
          <input value={draft.telefono || ''} onChange={(e) => set('telefono', e.target.value)} className="px-2 py-1.5 border border-gray-300 rounded text-sm focus:outline-none focus:ring-1 focus:ring-inyecta-500" />
        </Field>
        <Field label="Email">
          <input type="email" value={draft.email || ''} onChange={(e) => set('email', e.target.value)} className="px-2 py-1.5 border border-gray-300 rounded text-sm focus:outline-none focus:ring-1 focus:ring-inyecta-500" />
        </Field>
      </div>

      <div className="flex items-center justify-end gap-2 pt-3">
        <button onClick={onCancel} className="flex items-center gap-1 px-3 py-1.5 text-sm text-gray-600 hover:bg-gray-100 rounded">
          <X size={12} /> Cancelar
        </button>
        <button
          onClick={() => void onSave()}
          disabled={saving || !draft.tipo || (draft.tipo === 'PFAE' && !draft.nombre) || (draft.tipo === 'PM' && !draft.razonSocial)}
          className="flex items-center gap-1 px-3 py-1.5 bg-inyecta-600 hover:bg-inyecta-700 text-white rounded text-sm font-medium disabled:opacity-50"
        >
          <Save size={12} /> {saving ? 'Guardando…' : isNew ? 'Crear aval' : 'Guardar cambios'}
        </button>
      </div>
    </div>
  );
}

function Field({ label, required, children }: { label: string; required?: boolean; children: React.ReactNode }) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-xs text-gray-600">
        {label}
        {required && <span className="text-red-500"> *</span>}
      </span>
      {children}
    </label>
  );
}
