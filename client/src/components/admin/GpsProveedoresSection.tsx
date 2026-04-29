/**
 * Sección administrativa "Proveedores GPS" — se monta dentro de
 * /admin/catalogo. Permite a ADMIN/DIRECTOR:
 *   • Ver todos los proveedores existentes (incluye los inactivos)
 *   • Editar precios por plazo (24/36/48m), nombre, descripción
 *   • Activar/desactivar (soft-delete)
 *   • Crear uno nuevo (clave en MAYÚSCULAS, ej. SKYPATROL)
 *
 * Se aísla del componente padre porque Catalogo.tsx ya está denso —
 * mejor una sección autocontenida que comparte el mismo styling.
 */
import { useState, useEffect, useCallback } from 'react';
import api from '@/lib/api';
import { reloadGpsProveedores, type GpsProveedor } from '@/lib/cotizacion/gpsPricing';
import { Plus, Save, Trash2, Edit2, X, Check } from 'lucide-react';

interface DraftProveedor extends Omit<GpsProveedor, 'precio24m' | 'precio36m' | 'precio48m'> {
  precio24m: string;   // como string para edit en input
  precio36m: string;
  precio48m: string;
}

const EMPTY_DRAFT: DraftProveedor = {
  clave: '',
  nombre: '',
  descripcion: '',
  precio24m: '0',
  precio36m: '0',
  precio48m: '0',
  orden: 0,
  activo: true,
};

function fmtError(err: unknown): string {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const e = err as any;
  return e?.response?.data?.error?.message ?? e?.response?.data?.error ?? e?.message ?? 'Error';
}

function toDraft(p: GpsProveedor): DraftProveedor {
  return {
    ...p,
    descripcion: p.descripcion ?? '',
    precio24m: String(p.precio24m),
    precio36m: String(p.precio36m),
    precio48m: String(p.precio48m),
  };
}

export default function GpsProveedoresSection() {
  const [items, setItems] = useState<GpsProveedor[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState<string | 'new' | null>(null);
  const [draft, setDraft] = useState<DraftProveedor>(EMPTY_DRAFT);
  const [saving, setSaving] = useState(false);

  const reload = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await api.get('/config/gps-proveedores');
      setItems(res.data.proveedores || []);
    } catch (err) {
      setError(fmtError(err));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void reload(); }, [reload]);

  const startEdit = (p: GpsProveedor) => {
    setEditing(p.clave);
    setDraft(toDraft(p));
  };

  const startNew = () => {
    setEditing('new');
    setDraft({ ...EMPTY_DRAFT, orden: items.length + 1 });
  };

  const cancel = () => {
    setEditing(null);
    setDraft(EMPTY_DRAFT);
  };

  const save = async () => {
    setSaving(true);
    setError(null);
    try {
      const payload = {
        nombre: draft.nombre.trim(),
        descripcion: draft.descripcion?.trim() || null,
        precio24m: Number(draft.precio24m),
        precio36m: Number(draft.precio36m),
        precio48m: Number(draft.precio48m),
        orden: Number(draft.orden) || 0,
        activo: draft.activo,
      };
      const claveFinal = (editing === 'new' ? draft.clave : editing) as string;
      await api.put(`/config/gps-proveedores/${claveFinal}`, payload);
      cancel();
      await reload();
      // Invalida cache del cotizador para que vea los cambios al instante.
      await reloadGpsProveedores();
    } catch (err) {
      setError(fmtError(err));
    } finally {
      setSaving(false);
    }
  };

  const desactivar = async (clave: string) => {
    if (!confirm(`¿Desactivar el proveedor ${clave}? Las cotizaciones existentes mantienen la referencia, pero ya no aparece como opción en el cotizador.`)) return;
    try {
      await api.delete(`/config/gps-proveedores/${clave}`);
      await reload();
      await reloadGpsProveedores();
    } catch (err) {
      alert(fmtError(err));
    }
  };

  const inputCls = 'px-2 py-1 border border-gray-300 rounded text-sm w-full focus:outline-none focus:ring-1 focus:ring-inyecta-500';

  if (loading) return <div className="text-sm text-gray-500">Cargando proveedores GPS…</div>;

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-bold text-gray-700">Proveedores GPS ({items.length})</h3>
        {editing !== 'new' && (
          <button
            onClick={startNew}
            className="flex items-center gap-1 px-3 py-1.5 bg-inyecta-600 hover:bg-inyecta-700 text-white rounded text-xs font-medium"
          >
            <Plus size={12} /> Nuevo proveedor
          </button>
        )}
      </div>

      {error && <div className="p-2 rounded bg-red-50 border border-red-200 text-xs text-red-700">{error}</div>}

      <div className="overflow-x-auto border border-gray-200 rounded-lg">
        <table className="w-full text-sm min-w-[800px]">
          <thead className="bg-gray-50 text-xs text-gray-500">
            <tr>
              <th className="px-3 py-2 text-left">Clave</th>
              <th className="px-3 py-2 text-left">Nombre / Descripción</th>
              <th className="px-3 py-2 text-right">24m</th>
              <th className="px-3 py-2 text-right">36m</th>
              <th className="px-3 py-2 text-right">48m</th>
              <th className="px-3 py-2 text-center">Activo</th>
              <th className="px-3 py-2"></th>
            </tr>
          </thead>
          <tbody>
            {/* Fila para crear nuevo */}
            {editing === 'new' && (
              <tr className="border-t border-gray-200 bg-amber-50">
                <td className="px-3 py-2">
                  <input
                    value={draft.clave}
                    onChange={(e) => setDraft({ ...draft, clave: e.target.value.toUpperCase().replace(/[^A-Z0-9_]/g, '') })}
                    placeholder="GBR"
                    className={inputCls}
                  />
                </td>
                <td className="px-3 py-2 space-y-1">
                  <input value={draft.nombre} onChange={(e) => setDraft({ ...draft, nombre: e.target.value })} placeholder="Nombre comercial" className={inputCls} />
                  <input value={draft.descripcion ?? ''} onChange={(e) => setDraft({ ...draft, descripcion: e.target.value })} placeholder="Descripción (solo UI)" className={inputCls} />
                </td>
                <td className="px-3 py-2"><input type="number" value={draft.precio24m} onChange={(e) => setDraft({ ...draft, precio24m: e.target.value })} className={inputCls + ' text-right'} /></td>
                <td className="px-3 py-2"><input type="number" value={draft.precio36m} onChange={(e) => setDraft({ ...draft, precio36m: e.target.value })} className={inputCls + ' text-right'} /></td>
                <td className="px-3 py-2"><input type="number" value={draft.precio48m} onChange={(e) => setDraft({ ...draft, precio48m: e.target.value })} className={inputCls + ' text-right'} /></td>
                <td className="px-3 py-2 text-center">
                  <input type="checkbox" checked={draft.activo} onChange={(e) => setDraft({ ...draft, activo: e.target.checked })} className="rounded accent-inyecta-600" />
                </td>
                <td className="px-3 py-2">
                  <div className="flex items-center gap-1">
                    <button onClick={cancel} className="p-1 text-gray-500 hover:bg-gray-100 rounded" title="Cancelar"><X size={14} /></button>
                    <button
                      onClick={() => void save()}
                      disabled={saving || !draft.clave || !draft.nombre}
                      className="p-1 text-emerald-600 hover:bg-emerald-50 rounded disabled:opacity-50"
                      title="Guardar"
                    >
                      <Check size={14} />
                    </button>
                  </div>
                </td>
              </tr>
            )}
            {items.map((p) => {
              const isEditing = editing === p.clave;
              if (isEditing) {
                return (
                  <tr key={p.clave} className="border-t border-gray-200 bg-amber-50">
                    <td className="px-3 py-2 font-mono text-xs text-gray-700">{p.clave}</td>
                    <td className="px-3 py-2 space-y-1">
                      <input value={draft.nombre} onChange={(e) => setDraft({ ...draft, nombre: e.target.value })} className={inputCls} />
                      <input value={draft.descripcion ?? ''} onChange={(e) => setDraft({ ...draft, descripcion: e.target.value })} placeholder="Descripción (solo UI)" className={inputCls} />
                    </td>
                    <td className="px-3 py-2"><input type="number" value={draft.precio24m} onChange={(e) => setDraft({ ...draft, precio24m: e.target.value })} className={inputCls + ' text-right'} /></td>
                    <td className="px-3 py-2"><input type="number" value={draft.precio36m} onChange={(e) => setDraft({ ...draft, precio36m: e.target.value })} className={inputCls + ' text-right'} /></td>
                    <td className="px-3 py-2"><input type="number" value={draft.precio48m} onChange={(e) => setDraft({ ...draft, precio48m: e.target.value })} className={inputCls + ' text-right'} /></td>
                    <td className="px-3 py-2 text-center">
                      <input type="checkbox" checked={draft.activo} onChange={(e) => setDraft({ ...draft, activo: e.target.checked })} className="rounded accent-inyecta-600" />
                    </td>
                    <td className="px-3 py-2">
                      <div className="flex items-center gap-1">
                        <button onClick={cancel} className="p-1 text-gray-500 hover:bg-gray-100 rounded"><X size={14} /></button>
                        <button onClick={() => void save()} disabled={saving} className="p-1 text-emerald-600 hover:bg-emerald-50 rounded disabled:opacity-50"><Save size={14} /></button>
                      </div>
                    </td>
                  </tr>
                );
              }
              return (
                <tr key={p.clave} className={`border-t border-gray-100 ${p.activo ? '' : 'opacity-50'}`}>
                  <td className="px-3 py-2 font-mono text-xs text-gray-700">{p.clave}</td>
                  <td className="px-3 py-2">
                    <div className="font-medium text-gray-900">{p.nombre}</div>
                    {p.descripcion && <div className="text-xs text-gray-500">{p.descripcion}</div>}
                  </td>
                  <td className="px-3 py-2 text-right text-gray-700">${p.precio24m.toLocaleString('es-MX')}</td>
                  <td className="px-3 py-2 text-right text-gray-700">${p.precio36m.toLocaleString('es-MX')}</td>
                  <td className="px-3 py-2 text-right text-gray-700">${p.precio48m.toLocaleString('es-MX')}</td>
                  <td className="px-3 py-2 text-center">
                    <span className={`text-xs px-2 py-0.5 rounded ${p.activo ? 'bg-emerald-100 text-emerald-700' : 'bg-gray-100 text-gray-500'}`}>
                      {p.activo ? 'Sí' : 'No'}
                    </span>
                  </td>
                  <td className="px-3 py-2">
                    <div className="flex items-center gap-1">
                      <button onClick={() => startEdit(p)} className="p-1 text-gray-600 hover:bg-gray-100 rounded" title="Editar"><Edit2 size={14} /></button>
                      {p.activo && (
                        <button onClick={() => void desactivar(p.clave)} className="p-1 text-red-600 hover:bg-red-50 rounded" title="Desactivar"><Trash2 size={14} /></button>
                      )}
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <p className="text-xs text-gray-500">
        El precio del GPS se selecciona automáticamente en el cotizador según el plazo elegido.
        El default por valor del bien (Bien &lt; $500k → primer proveedor activo, Bien ≥ $500k → segundo) se controla por el orden y por la clave en código (<code>proveedorDefault()</code>).
      </p>
    </div>
  );
}
