// Paso 4 — Obligados solidarios (avales).
//
// Los avales (Guarantor) viven colgados del Client. Aquí sólo los
// ASIGNAMOS al contrato con un `orden` (1..3). La creación de un
// aval nuevo se delega al AvalFormModal.
//
// Modelo de datos (sincronizado con el form del wizard):
//   obligadosSolidarios: Array<{ guarantorId: string; orden: number }>
//
// Reglas enforced aquí (UI) y en el schema (server + mirror):
//   - Máximo 3
//   - `orden` único por contrato
//   - `guarantorId` único por contrato
//
// Si el cliente no está seleccionado (p. ej. si se navega directo al
// paso 4 sin pasar por 1), mostramos un aviso y ocultamos la lista.

import { useCallback, useEffect, useState } from 'react';
import { useFormContext } from 'react-hook-form';
import {
  AlertCircle,
  Building2,
  Info,
  Loader2,
  Plus,
  RefreshCw,
  Trash2,
  User,
} from 'lucide-react';
import api from '@/lib/api';
import { FormSection } from '@/components/wizard/fields';
import { AvalFormModal } from './AvalFormModal';

interface Props {
  /** Cliente seleccionado en paso 1; necesario para cargar y crear avales. */
  clientId: string | null;
}

interface GuarantorRow {
  id: string;
  nombre?: string | null;
  apellidoPaterno?: string | null;
  apellidoMaterno?: string | null;
  razonSocial?: string | null;
  rfc?: string | null;
  relacion?: string | null;
}

interface Asignacion {
  guarantorId: string;
  orden: number;
}

function displayAval(g: GuarantorRow): string {
  if (g.razonSocial) return g.razonSocial;
  return (
    [g.nombre, g.apellidoPaterno, g.apellidoMaterno]
      .filter(Boolean)
      .join(' ') || 'Sin nombre'
  );
}

export function Step4Avales({ clientId }: Props) {
  const { watch, setValue } = useFormContext();
  const asignaciones: Asignacion[] =
    (watch('obligadosSolidarios') as Asignacion[] | undefined) ?? [];

  const [avales, setAvales] = useState<GuarantorRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [showModal, setShowModal] = useState(false);

  const loadAvales = useCallback(async () => {
    if (!clientId) {
      setAvales([]);
      return;
    }
    setLoading(true);
    setLoadError(null);
    try {
      const res = await api.get(`/clients/${clientId}/guarantors`);
      setAvales(Array.isArray(res.data) ? res.data : []);
    } catch (err: unknown) {
      const e = err as { response?: { data?: { message?: string } } };
      setLoadError(
        e.response?.data?.message ?? 'No se pudieron cargar los avales',
      );
      setAvales([]);
    } finally {
      setLoading(false);
    }
  }, [clientId]);

  useEffect(() => {
    void loadAvales();
  }, [loadAvales]);

  // ── Helpers para mutar obligadosSolidarios ─────────────────────
  const updateAsignaciones = (next: Asignacion[]) => {
    setValue('obligadosSolidarios', next, {
      shouldDirty: true,
      shouldValidate: true,
    });
  };

  const isSelected = (guarantorId: string) =>
    asignaciones.some((a) => a.guarantorId === guarantorId);

  const ordenDe = (guarantorId: string): number | undefined =>
    asignaciones.find((a) => a.guarantorId === guarantorId)?.orden;

  const nextOrdenDisponible = (): number => {
    const usados = new Set(asignaciones.map((a) => a.orden));
    for (let i = 1; i <= 3; i++) if (!usados.has(i)) return i;
    return 1;
  };

  const toggleAval = (guarantorId: string) => {
    if (isSelected(guarantorId)) {
      updateAsignaciones(
        asignaciones.filter((a) => a.guarantorId !== guarantorId),
      );
    } else {
      if (asignaciones.length >= 3) return; // hard cap 3
      updateAsignaciones([
        ...asignaciones,
        { guarantorId, orden: nextOrdenDisponible() },
      ]);
    }
  };

  const cambiarOrden = (guarantorId: string, orden: number) => {
    updateAsignaciones(
      asignaciones.map((a) =>
        a.guarantorId === guarantorId ? { ...a, orden } : a,
      ),
    );
  };

  // ── Validaciones a mostrar en la UI ────────────────────────────
  const ordenes = asignaciones.map((a) => a.orden);
  const hayOrdenDuplicado = new Set(ordenes).size !== ordenes.length;
  const excedeMax = asignaciones.length > 3;

  const handleAvalCreado = async (nuevo: { id: string }) => {
    setShowModal(false);
    // Refrescamos la lista y auto-seleccionamos al recién creado si
    // aún queda cupo.
    await loadAvales();
    if (asignaciones.length < 3 && !isSelected(nuevo.id)) {
      updateAsignaciones([
        ...asignaciones,
        { guarantorId: nuevo.id, orden: nextOrdenDisponible() },
      ]);
    }
  };

  // ── Render ─────────────────────────────────────────────────────

  if (!clientId) {
    return (
      <FormSection
        title="Obligados solidarios"
        description="Selecciona un cliente en el paso 1 antes de administrar avales."
      >
        <div className="border border-dashed border-gray-300 rounded-xl p-6 text-center text-sm text-gray-500">
          <div className="flex items-center justify-center gap-2">
            <AlertCircle size={14} />
            <span>Sin cliente seleccionado</span>
          </div>
        </div>
      </FormSection>
    );
  }

  return (
    <>
      <FormSection
        title="Obligados solidarios"
        description="Asigna hasta 3 avales al contrato. El aval se guarda en el cliente y se puede reutilizar en otras operaciones."
      >
        <div className="flex items-center justify-between mb-4">
          <div className="text-sm text-gray-600">
            {asignaciones.length} de 3 avales asignados
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => void loadAvales()}
              className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs text-gray-600 hover:bg-gray-100"
              disabled={loading}
            >
              <RefreshCw size={12} className={loading ? 'animate-spin' : ''} />
              Refrescar
            </button>
            <button
              type="button"
              onClick={() => setShowModal(true)}
              className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg bg-inyecta-700 hover:bg-inyecta-800 text-white text-xs font-medium transition-colors"
            >
              <Plus size={14} /> Agregar aval nuevo
            </button>
          </div>
        </div>

        {/* Avisos de validación UI */}
        {excedeMax && (
          <div className="bg-red-50 border border-red-200 text-red-700 px-3 py-2 rounded-lg text-xs mb-3 flex items-center gap-2">
            <AlertCircle size={14} /> Máximo 3 obligados solidarios por
            contrato.
          </div>
        )}
        {hayOrdenDuplicado && (
          <div className="bg-red-50 border border-red-200 text-red-700 px-3 py-2 rounded-lg text-xs mb-3 flex items-center gap-2">
            <AlertCircle size={14} /> Cada aval debe tener un orden distinto (1,
            2 o 3).
          </div>
        )}
        {asignaciones.length === 0 && avales.length > 0 && (
          <div className="bg-amber-50 border border-amber-200 text-amber-800 px-3 py-2 rounded-lg text-xs mb-3 flex items-center gap-2">
            <Info size={14} /> No se ha asignado ningún aval. Selecciona al menos
            uno o continúa sin avales si el producto lo permite.
          </div>
        )}

        {loadError && (
          <div className="bg-red-50 border border-red-200 text-red-700 px-3 py-2 rounded-lg text-xs mb-3 flex items-center gap-2">
            <AlertCircle size={14} /> {loadError}
          </div>
        )}

        {/* Lista de avales */}
        {loading ? (
          <div className="p-6 text-center text-sm text-gray-400">
            <Loader2 size={16} className="inline animate-spin mr-2" />
            Cargando avales…
          </div>
        ) : avales.length === 0 ? (
          <div className="border border-dashed border-gray-300 rounded-xl p-6 text-center text-sm text-gray-500">
            <p className="mb-2">Este cliente aún no tiene avales registrados.</p>
            <button
              type="button"
              onClick={() => setShowModal(true)}
              className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg bg-inyecta-700 hover:bg-inyecta-800 text-white text-xs font-medium"
            >
              <Plus size={14} /> Crear el primer aval
            </button>
          </div>
        ) : (
          <div className="space-y-2">
            {avales.map((a) => {
              const seleccionado = isSelected(a.id);
              const orden = ordenDe(a.id);
              const sinCupo = !seleccionado && asignaciones.length >= 3;
              const esPM = !!a.razonSocial;
              return (
                <div
                  key={a.id}
                  className={
                    'flex items-center justify-between p-3 rounded-lg border transition-colors ' +
                    (seleccionado
                      ? 'border-inyecta-300 bg-inyecta-50'
                      : 'border-gray-200 bg-white hover:bg-gray-50')
                  }
                >
                  <label
                    className={
                      'flex items-center gap-3 flex-1 ' +
                      (sinCupo ? 'cursor-not-allowed opacity-50' : 'cursor-pointer')
                    }
                  >
                    <input
                      type="checkbox"
                      checked={seleccionado}
                      disabled={sinCupo}
                      onChange={() => toggleAval(a.id)}
                      className="h-4 w-4 rounded border-gray-300 text-inyecta-600 focus:ring-inyecta-500"
                    />
                    <div
                      className={
                        'w-8 h-8 rounded-full flex items-center justify-center text-white ' +
                        (esPM ? 'bg-blue-500' : 'bg-emerald-500')
                      }
                    >
                      {esPM ? <Building2 size={14} /> : <User size={14} />}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-gray-900 text-sm truncate">
                        {displayAval(a)}
                      </p>
                      <p className="text-xs text-gray-500 truncate">
                        {a.rfc ? (
                          <span className="font-mono">{a.rfc}</span>
                        ) : (
                          <span>Sin RFC</span>
                        )}
                        {a.relacion ? ` · ${a.relacion}` : ''}
                      </p>
                    </div>
                  </label>

                  {seleccionado && (
                    <div className="flex items-center gap-2 ml-3">
                      <label className="text-xs text-gray-600">Orden:</label>
                      <select
                        value={orden ?? 1}
                        onChange={(e) =>
                          cambiarOrden(a.id, Number(e.target.value))
                        }
                        className="px-2 py-1 border border-gray-300 rounded-lg text-xs bg-white focus:ring-2 focus:ring-inyecta-500 focus:border-inyecta-500 outline-none"
                      >
                        {[1, 2, 3].map((n) => (
                          <option key={n} value={n}>
                            {n}
                          </option>
                        ))}
                      </select>
                      <button
                        type="button"
                        onClick={() => toggleAval(a.id)}
                        className="text-red-500 hover:text-red-700"
                        title="Quitar del contrato"
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}

        <p className="mt-4 text-xs text-gray-500">
          El orden (1-3) se usa para imprimir los avales en el contrato y en la
          solicitud CNBV. Cada orden sólo puede asignarse una vez.
        </p>
      </FormSection>

      {showModal && (
        <AvalFormModal
          clientId={clientId}
          onClose={() => setShowModal(false)}
          onCreated={handleAvalCreado}
        />
      )}
    </>
  );
}
