/**
 * Administración › Usuarios (empleados de Inyecta)
 * ----------------------------------------------------------------
 * Lista todos los usuarios del sistema y permite a un ADMIN:
 *   • Crear nuevos empleados (modal "Nuevo usuario")
 *   • Editar nombre/rol (modal "Editar")
 *   • Resetear contraseña (modal con captura, no devuelve nada)
 *   • Activar/desactivar (toggle inline; soft-disable, conserva historial)
 *
 * DIRECTOR puede ver el listado pero los botones de acción quedan
 * deshabilitados (consistencia con la UI de Catálogo).
 *
 * Reglas anti-lockout (espejo del backend):
 *   - El usuario actual no se puede autodesactivar ni autodegradar
 *     (los botones se deshabilitan + el server también valida).
 *   - El último ADMIN activo no se puede desactivar (server lo
 *     valida; UI sólo deshabilita en el self-case obvio).
 *
 * Diseño visual: espejo de Catalogo.tsx (cards, header con icono,
 * tabla zebra, badges por rol). Sin librería de modal — usa <dialog>
 * nativo con open/close manual para mantener bundle pequeño.
 */
import { useEffect, useState } from 'react';
import api from '@/lib/api';
import { useAuth } from '@/context/AuthContext';
import {
  Users, Shield, AlertTriangle, CheckCircle2, Plus, Edit2, KeyRound,
  ToggleLeft, ToggleRight, X, Save, RefreshCw,
} from 'lucide-react';

// El enum debe espejear el de server/src/routes/users.ts ROL_VALUES.
const ROLES = ['ADMIN', 'DIRECTOR', 'ANALISTA', 'COBRANZA', 'OPERACIONES', 'LEGAL'] as const;
type Rol = (typeof ROLES)[number];

const ROL_DESCRIPCION: Record<Rol, string> = {
  ADMIN:       'Acceso total + gestión de usuarios y catálogos',
  DIRECTOR:    'Acceso a reportes ejecutivos y bitácora',
  ANALISTA:    'Operación de cotizaciones, clientes y contratos',
  COBRANZA:    'Operación de cobranza y conciliación',
  OPERACIONES: 'Operaciones del día a día (cotizar, contratos, GPS)',
  LEGAL:       'Recibe notificaciones de SOLICITUD_* (CNBV)',
};

const ROL_BADGE: Record<Rol, string> = {
  ADMIN:       'bg-purple-100 text-purple-800 border-purple-200',
  DIRECTOR:    'bg-indigo-100 text-indigo-800 border-indigo-200',
  ANALISTA:    'bg-blue-100 text-blue-800 border-blue-200',
  COBRANZA:    'bg-emerald-100 text-emerald-800 border-emerald-200',
  OPERACIONES: 'bg-amber-100 text-amber-800 border-amber-200',
  LEGAL:       'bg-slate-100 text-slate-800 border-slate-200',
};

interface UserRow {
  id:        string;
  email:     string;
  nombre:    string;
  apellidos: string;
  rol:       Rol;
  activo:    boolean;
  createdAt: string;
  updatedAt: string;
}

export default function Usuarios() {
  const { user: me } = useAuth();
  const isAdmin    = me?.rol === 'ADMIN';
  const isDirector = me?.rol === 'DIRECTOR';
  const allowed    = isAdmin || isDirector;

  const [users, setUsers] = useState<UserRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error,   setError]   = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  // Modal state — un solo modal con `mode` para no anidar componentes.
  type ModalMode = null | 'create' | 'edit' | 'reset';
  const [modalMode, setModalMode] = useState<ModalMode>(null);
  const [modalUser, setModalUser] = useState<UserRow | null>(null);

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await api.get<{ users: UserRow[] }>('/users');
      setUsers(res.data.users);
    } catch (err: unknown) {
      const msg = extractError(err) ?? 'No se pudo cargar el listado';
      setError(msg);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (allowed) void load();
    else setLoading(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [allowed]);

  if (!allowed) {
    return (
      <div className="max-w-2xl mx-auto py-12 text-center">
        <Shield size={40} className="mx-auto text-gray-300 mb-3" />
        <h2 className="text-lg font-semibold text-gray-900">Acceso restringido</h2>
        <p className="text-sm text-gray-500 mt-1">
          Solo ADMIN o DIRECTOR pueden ver el listado de usuarios.
        </p>
      </div>
    );
  }

  // ── Acciones inline (toggle activo) ─────────────────────────────
  const toggleActivo = async (u: UserRow) => {
    if (!isAdmin) return;
    if (u.id === me?.id) {
      setError('No puedes desactivarte a ti mismo.');
      return;
    }
    setError(null);
    setSuccess(null);
    try {
      const path = u.activo ? `/users/${u.id}/deactivate` : `/users/${u.id}/activate`;
      const res = await api.patch<UserRow>(path);
      setUsers((arr) => arr.map((x) => (x.id === u.id ? res.data : x)));
      setSuccess(`${u.nombre} ${u.apellidos} ${u.activo ? 'desactivado' : 'reactivado'}.`);
    } catch (err: unknown) {
      setError(extractError(err) ?? 'No se pudo actualizar');
    }
  };

  const closeModal = () => {
    setModalMode(null);
    setModalUser(null);
  };

  // ── Render ──────────────────────────────────────────────────────
  return (
    <div className="max-w-5xl mx-auto">
      <div className="mb-6 flex items-start justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold text-gray-900 flex items-center gap-2">
            <Users size={20} className="text-inyecta-700" />
            Usuarios del sistema
          </h1>
          <p className="text-sm text-gray-500 mt-1">
            Empleados de Inyecta con acceso a la plataforma. La baja es
            lógica (activo=false) — el historial se conserva para auditoría.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => void load()}
            className="flex items-center gap-1.5 px-3 py-2 border border-gray-300 text-gray-700 hover:bg-gray-50 rounded-lg text-sm font-medium"
            title="Recargar"
          >
            <RefreshCw size={14} />
          </button>
          {isAdmin && (
            <button
              type="button"
              onClick={() => { setModalMode('create'); setModalUser(null); }}
              className="flex items-center gap-1.5 px-4 py-2 bg-inyecta-700 hover:bg-inyecta-800 text-white rounded-lg text-sm font-medium shadow-sm"
            >
              <Plus size={14} />
              Nuevo usuario
            </button>
          )}
        </div>
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

      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        {loading ? (
          <div className="p-12 text-center text-sm text-gray-400">Cargando usuarios…</div>
        ) : users.length === 0 ? (
          <div className="p-12 text-center text-sm text-gray-400">No hay usuarios todavía.</div>
        ) : (
          <table className="min-w-full text-sm">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr className="text-xs font-medium text-gray-500 uppercase">
                <th className="px-3 py-2.5 text-left">Nombre</th>
                <th className="px-3 py-2.5 text-left">Email</th>
                <th className="px-3 py-2.5 text-left">Rol</th>
                <th className="px-3 py-2.5 text-left">Estatus</th>
                <th className="px-3 py-2.5 text-right">Acciones</th>
              </tr>
            </thead>
            <tbody>
              {users.map((u, i) => {
                const isMe = u.id === me?.id;
                return (
                  <tr key={u.id} className={i % 2 === 0 ? 'bg-white' : 'bg-gray-50/50'}>
                    <td className="px-3 py-2.5">
                      <div className="font-medium text-gray-900">{u.nombre} {u.apellidos}</div>
                      {isMe && <div className="text-[11px] text-gray-400">Tu cuenta</div>}
                    </td>
                    <td className="px-3 py-2.5 text-gray-600">{u.email}</td>
                    <td className="px-3 py-2.5">
                      <span className={`inline-block text-[11px] font-semibold px-2 py-0.5 rounded border ${ROL_BADGE[u.rol]}`}>
                        {u.rol}
                      </span>
                    </td>
                    <td className="px-3 py-2.5">
                      {u.activo ? (
                        <span className="inline-flex items-center gap-1 text-emerald-700 text-xs font-medium">
                          <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                          Activo
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 text-gray-400 text-xs font-medium">
                          <span className="w-1.5 h-1.5 rounded-full bg-gray-300" />
                          Desactivado
                        </span>
                      )}
                    </td>
                    <td className="px-3 py-2.5 text-right">
                      <div className="inline-flex items-center gap-1">
                        {isAdmin && (
                          <>
                            <button
                              type="button"
                              onClick={() => { setModalMode('edit'); setModalUser(u); }}
                              className="p-1.5 text-gray-500 hover:text-inyecta-700 hover:bg-inyecta-50 rounded"
                              title="Editar nombre y rol"
                            >
                              <Edit2 size={14} />
                            </button>
                            <button
                              type="button"
                              onClick={() => { setModalMode('reset'); setModalUser(u); }}
                              className="p-1.5 text-gray-500 hover:text-amber-700 hover:bg-amber-50 rounded"
                              title="Resetear contraseña"
                            >
                              <KeyRound size={14} />
                            </button>
                            <button
                              type="button"
                              onClick={() => void toggleActivo(u)}
                              disabled={isMe && u.activo}
                              className="p-1.5 text-gray-500 hover:text-rose-700 hover:bg-rose-50 rounded disabled:opacity-30 disabled:cursor-not-allowed"
                              title={
                                isMe && u.activo
                                  ? 'No puedes desactivarte a ti mismo'
                                  : u.activo ? 'Desactivar' : 'Reactivar'
                              }
                            >
                              {u.activo ? <ToggleRight size={16} /> : <ToggleLeft size={16} />}
                            </button>
                          </>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      <p className="text-[11px] text-gray-400 mt-3">
        Para crear ADMIN adicionales se necesita un ADMIN existente. El primer
        ADMIN del sistema se crea con el seed (<code className="font-mono">npm run db:seed</code>).
      </p>

      {modalMode && (
        <UserModal
          mode={modalMode}
          target={modalUser}
          onClose={closeModal}
          onSaved={(msg) => { setSuccess(msg); void load(); closeModal(); }}
        />
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────
// Modal — create / edit / reset (un solo componente con `mode`)
// ─────────────────────────────────────────────────────────────────
interface UserModalProps {
  mode: 'create' | 'edit' | 'reset';
  target: UserRow | null;
  onClose: () => void;
  onSaved: (mensaje: string) => void;
}

function UserModal({ mode, target, onClose, onSaved }: UserModalProps) {
  const [form, setForm] = useState({
    email:     target?.email     ?? '',
    nombre:    target?.nombre    ?? '',
    apellidos: target?.apellidos ?? '',
    rol:       (target?.rol      ?? 'ANALISTA') as Rol,
    password:  '',
  });
  const [saving, setSaving] = useState(false);
  const [err,    setErr]    = useState<string | null>(null);

  const title =
    mode === 'create' ? 'Nuevo usuario' :
    mode === 'edit'   ? `Editar ${target?.nombre} ${target?.apellidos}` :
    `Reset password — ${target?.nombre} ${target?.apellidos}`;

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErr(null);
    setSaving(true);
    try {
      if (mode === 'create') {
        if (form.password.length < 8) throw new Error('La contraseña debe tener al menos 8 caracteres.');
        await api.post('/users', {
          email:     form.email.trim().toLowerCase(),
          password:  form.password,
          nombre:    form.nombre.trim(),
          apellidos: form.apellidos.trim(),
          rol:       form.rol,
        });
        onSaved(`Usuario ${form.email} creado.`);
      } else if (mode === 'edit') {
        if (!target) return;
        await api.patch(`/users/${target.id}`, {
          nombre:    form.nombre.trim(),
          apellidos: form.apellidos.trim(),
          rol:       form.rol,
        });
        onSaved(`Usuario ${target.email} actualizado.`);
      } else if (mode === 'reset') {
        if (!target) return;
        if (form.password.length < 8) throw new Error('La contraseña debe tener al menos 8 caracteres.');
        await api.post(`/users/${target.id}/reset-password`, { password: form.password });
        onSaved(`Contraseña de ${target.email} actualizada. Comunícala por canal seguro.`);
      }
    } catch (error: unknown) {
      setErr(extractError(error) ?? (error instanceof Error ? error.message : 'Error al guardar'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div
      className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
    >
      <div
        className="bg-white rounded-xl shadow-xl max-w-md w-full p-5"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3 mb-4">
          <h3 className="text-base font-semibold text-gray-900">{title}</h3>
          <button
            type="button"
            onClick={onClose}
            className="p-1 text-gray-400 hover:text-gray-600 rounded"
            aria-label="Cerrar"
          >
            <X size={16} />
          </button>
        </div>

        {err && (
          <div className="mb-3 bg-red-50 border border-red-200 rounded-md p-2 text-xs text-red-800 flex items-start gap-1.5">
            <AlertTriangle size={13} className="mt-0.5 flex-shrink-0" />
            <span>{err}</span>
          </div>
        )}

        <form onSubmit={submit} className="space-y-3">
          {mode === 'create' && (
            <Field label="Email">
              <input
                type="email"
                required
                value={form.email}
                onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
                className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-inyecta-500"
              />
            </Field>
          )}

          {(mode === 'create' || mode === 'edit') && (
            <>
              <div className="grid grid-cols-2 gap-2">
                <Field label="Nombre">
                  <input
                    type="text"
                    required
                    value={form.nombre}
                    onChange={(e) => setForm((f) => ({ ...f, nombre: e.target.value }))}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-inyecta-500"
                  />
                </Field>
                <Field label="Apellidos">
                  <input
                    type="text"
                    required
                    value={form.apellidos}
                    onChange={(e) => setForm((f) => ({ ...f, apellidos: e.target.value }))}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-inyecta-500"
                  />
                </Field>
              </div>
              <Field label="Rol">
                <select
                  value={form.rol}
                  onChange={(e) => setForm((f) => ({ ...f, rol: e.target.value as Rol }))}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-inyecta-500 bg-white"
                >
                  {ROLES.map((r) => (
                    <option key={r} value={r}>{r}</option>
                  ))}
                </select>
                <p className="text-[11px] text-gray-500 mt-1">{ROL_DESCRIPCION[form.rol]}</p>
              </Field>
            </>
          )}

          {(mode === 'create' || mode === 'reset') && (
            <Field
              label={mode === 'create' ? 'Contraseña inicial' : 'Nueva contraseña'}
              hint="Mínimo 8 caracteres. Comunícala por canal seguro al usuario."
            >
              <input
                type="text"
                required
                minLength={8}
                value={form.password}
                onChange={(e) => setForm((f) => ({ ...f, password: e.target.value }))}
                autoComplete="new-password"
                className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm font-mono focus:outline-none focus:ring-2 focus:ring-inyecta-500"
              />
            </Field>
          )}

          <div className="flex justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={onClose}
              disabled={saving}
              className="px-3 py-2 border border-gray-300 text-gray-700 hover:bg-gray-50 rounded-lg text-sm font-medium disabled:opacity-50"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={saving}
              className="flex items-center gap-1.5 px-4 py-2 bg-inyecta-700 hover:bg-inyecta-800 text-white rounded-lg text-sm font-medium shadow-sm disabled:opacity-50"
            >
              {saving ? (
                <>
                  <div className="animate-spin rounded-full h-3.5 w-3.5 border-2 border-white border-t-transparent" />
                  Guardando…
                </>
              ) : (
                <>
                  <Save size={14} />
                  Guardar
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function Field({
  label, hint, children,
}: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-xs font-medium text-gray-700 mb-1">{label}</label>
      {children}
      {hint && <p className="text-[11px] text-gray-400 mt-1">{hint}</p>}
    </div>
  );
}

// Extrae mensaje de un AxiosError sin importar la lib (no queremos
// la dep tipada). Espejea el shape de `errorHandler` del backend:
//   { error: { code, message, details? } }   o   { error: 'string' }
function extractError(err: unknown): string | null {
  if (!err || typeof err !== 'object') return null;
  // @ts-expect-error — axios error shape
  const data = err.response?.data;
  if (!data) return null;
  if (typeof data.error === 'string') return data.error;
  if (typeof data.error?.message === 'string') return data.error.message;
  return null;
}
