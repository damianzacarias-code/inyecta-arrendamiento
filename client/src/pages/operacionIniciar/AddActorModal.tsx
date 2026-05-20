/**
 * AddActorModal — modal para declarar un nuevo actor del borrador.
 *
 * El operador elige rol (TITULAR/AVAL en v0; REP_LEGAL y SOCIO
 * disabled), subtipo (PFAE/PM/PF según rol) y captura el nombre
 * tentativo (luego se reemplazará con el del INE / CSF).
 */
import { useState, useEffect } from 'react';
import { X } from 'lucide-react';
import type { DraftActorRol, ActorSubtipo, CrearActorPayload } from './types';

interface Props {
  open: boolean;
  onClose: () => void;
  onSubmit: (payload: CrearActorPayload) => Promise<void>;
  /** Si ya existe titular, ocultar la opción TITULAR del dropdown. */
  yaHayTitular: boolean;
  /** Rol pre-seleccionado al abrir (ej. "AVAL" desde el botón + Aval). */
  rolDefault?: DraftActorRol;
}

const ROLES: { value: DraftActorRol; label: string; disabled?: boolean; hint?: string }[] = [
  { value: 'TITULAR', label: 'Titular' },
  { value: 'AVAL', label: 'Aval / Obligado solidario' },
  { value: 'REPRESENTANTE_LEGAL', label: 'Representante Legal', disabled: true, hint: 'v0.1' },
  { value: 'SOCIO', label: 'Socio / Accionista', disabled: true, hint: 'v0.1' },
];

function subtiposValidos(rol: DraftActorRol): { value: ActorSubtipo; label: string }[] {
  if (rol === 'TITULAR') {
    return [
      { value: 'PFAE', label: 'PFAE (Persona Física con Act. Empresarial)' },
      { value: 'PM', label: 'PM (Persona Moral)' },
    ];
  }
  if (rol === 'REPRESENTANTE_LEGAL' || rol === 'SOCIO') {
    return [{ value: 'PF', label: 'PF (Persona Física)' }];
  }
  // AVAL acepta los tres
  return [
    { value: 'PF', label: 'PF (Persona Física)' },
    { value: 'PFAE', label: 'PFAE (Persona Física con Act. Empresarial)' },
    { value: 'PM', label: 'PM (Persona Moral)' },
  ];
}

export function AddActorModal({ open, onClose, onSubmit, yaHayTitular, rolDefault }: Props) {
  const [rol, setRol] = useState<DraftActorRol>(rolDefault ?? 'AVAL');
  const [subtipo, setSubtipo] = useState<ActorSubtipo>('PF');
  const [nombre, setNombre] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Reset al abrir
  useEffect(() => {
    if (!open) return;
    setRol(rolDefault ?? (yaHayTitular ? 'AVAL' : 'TITULAR'));
    setNombre('');
    setError(null);
  }, [open, rolDefault, yaHayTitular]);

  // Cuando cambia el rol, ajustar subtipo al primero válido
  useEffect(() => {
    const opts = subtiposValidos(rol);
    if (!opts.find((o) => o.value === subtipo)) {
      setSubtipo(opts[0].value);
    }
  }, [rol, subtipo]);

  if (!open) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!nombre.trim()) {
      setError('El nombre es requerido');
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      await onSubmit({ rol, subtipo, nombre: nombre.trim() });
      onClose();
    } catch (err) {
      const msg = (err as { response?: { data?: { error?: { message?: string } } } })
        ?.response?.data?.error?.message ?? 'Error al crear actor';
      setError(msg);
      setSubmitting(false);
    }
  };

  return (
    <div
      className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-xl shadow-xl max-w-md w-full p-5"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-base font-semibold text-gray-900">Agregar involucrado</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
            <X size={18} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-3">
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Rol</label>
            <select
              value={rol}
              onChange={(e) => setRol(e.target.value as DraftActorRol)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-inyecta-500 focus:border-inyecta-500 outline-none"
            >
              {ROLES.map((r) => (
                <option
                  key={r.value}
                  value={r.value}
                  disabled={r.disabled || (r.value === 'TITULAR' && yaHayTitular)}
                >
                  {r.label}
                  {r.disabled ? ` (${r.hint})` : ''}
                  {r.value === 'TITULAR' && yaHayTitular ? ' (ya existe)' : ''}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Tipo de persona</label>
            <select
              value={subtipo}
              onChange={(e) => setSubtipo(e.target.value as ActorSubtipo)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-inyecta-500 focus:border-inyecta-500 outline-none"
            >
              {subtiposValidos(rol).map((s) => (
                <option key={s.value} value={s.value}>{s.label}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">
              Nombre tentativo
            </label>
            <input
              type="text"
              value={nombre}
              onChange={(e) => setNombre(e.target.value)}
              placeholder={subtipo === 'PM' ? 'Razón social' : 'Nombre completo'}
              maxLength={200}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-inyecta-500 focus:border-inyecta-500 outline-none"
            />
            <p className="text-xs text-gray-400 mt-1">
              Se reemplaza automáticamente cuando subas su INE o CSF.
            </p>
          </div>

          {error && (
            <div className="bg-red-50 border border-red-200 rounded-lg p-2 text-xs text-red-700">
              {error}
            </div>
          )}

          <div className="flex items-center justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={onClose}
              disabled={submitting}
              className="px-3 py-1.5 text-sm text-gray-600 hover:text-gray-800 disabled:opacity-50"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={submitting || !nombre.trim()}
              className="px-4 py-1.5 bg-inyecta-700 text-white rounded-lg text-sm font-medium hover:bg-inyecta-800 disabled:bg-gray-300"
            >
              {submitting ? 'Creando...' : 'Agregar'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
