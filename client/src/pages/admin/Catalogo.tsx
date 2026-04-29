/**
 * Administración › Catálogo de tasas, comisiones y GPS
 * ----------------------------------------------------------------
 * Edita la fila 'default' del catálogo + los tres presets de riesgo
 * (A/B/C). Lo consume el cotizador como defaults al boot.
 *
 * Flujo:
 *   1. Lee `useCatalog()` para hidratar el form con los valores actuales.
 *   2. El usuario edita los porcentajes (UI los muestra como % humanos
 *      0-100 aunque la BD los guarde como 0-1).
 *   3. Submit dispara 4 PUTs en paralelo (catalog + 3 risk presets) y
 *      luego `reloadCatalog()` para que el resto de la app refresque.
 *   4. Si una de las 4 PUT falla, se reporta y NO se recarga (queda el
 *      cache viejo, evitando un estado inconsistente en el cliente).
 *
 * Restringido a ADMIN / DIRECTOR — el endpoint también valida el rol.
 *
 * Por qué los rangos en %  : la BD guarda 0.36 (decimal); editar 36.00
 * es más natural para el operador. La conversión se hace en el submit.
 */
import { useEffect, useState } from 'react';
import api from '@/lib/api';
import { useAuth } from '@/context/AuthContext';
import { useCatalog, reloadCatalog } from '@/lib/catalog';
import GpsProveedoresSection from '@/components/admin/GpsProveedoresSection';
import {
  Settings, AlertTriangle, CheckCircle2, Shield, Save, Percent,
  MapPin, Banknote, RotateCcw, Navigation,
} from 'lucide-react';

// ── helpers de conversión BD ↔ UI ───────────────────────────────────
// La BD guarda fracciones (0.36 = 36%). El form trabaja con 0-100
// para que el operador no tenga que convertir mentalmente.
const toPct = (n: number) => +(n * 100).toFixed(4);
const fromPct = (s: string) => Number(s) / 100;

interface CatalogForm {
  tasaAnualDefault:        string;  // %
  tasaAnualMin:            string;  // %
  tasaAnualMax:            string;  // %
  comisionAperturaDefault: string;  // %
  comisionAperturaMin:     string;  // %
  comisionAperturaMax:     string;  // %
  gpsMontoDefault:         string;  // MXN
  gpsFinanciableDefault:   boolean;
  tasaMoratoriaMultiplier: string;  // x
}

interface RiskForm {
  nivel: string;
  nombre: string;
  engachePuroPct:  string;  // %
  depositoPuroPct: string;  // %
  engancheFinPct:  string;  // %
  depositoFinPct:  string;  // %
  orden: number;
}

export default function Catalogo() {
  const { user } = useAuth();
  const allowed = user?.rol === 'ADMIN' || user?.rol === 'DIRECTOR';

  const { catalog, riskPresets } = useCatalog();

  const [form, setForm] = useState<CatalogForm>(() => ({
    tasaAnualDefault:        toPct(catalog.tasaAnualDefault).toString(),
    tasaAnualMin:            toPct(catalog.tasaAnualMin).toString(),
    tasaAnualMax:            toPct(catalog.tasaAnualMax).toString(),
    comisionAperturaDefault: toPct(catalog.comisionAperturaDefault).toString(),
    comisionAperturaMin:     toPct(catalog.comisionAperturaMin).toString(),
    comisionAperturaMax:     toPct(catalog.comisionAperturaMax).toString(),
    gpsMontoDefault:         catalog.gpsMontoDefault.toString(),
    gpsFinanciableDefault:   catalog.gpsFinanciableDefault,
    tasaMoratoriaMultiplier: catalog.tasaMoratoriaMultiplier.toString(),
  }));

  const [risks, setRisks] = useState<RiskForm[]>(() =>
    riskPresets.map((p) => ({
      nivel: p.nivel,
      nombre: p.nombre,
      engachePuroPct:  toPct(p.engachePuroPct).toString(),
      depositoPuroPct: toPct(p.depositoPuroPct).toString(),
      engancheFinPct:  toPct(p.engancheFinPct).toString(),
      depositoFinPct:  toPct(p.depositoFinPct).toString(),
      orden: p.orden,
    })),
  );

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  // Si llega data fresca después del primer render (catalog se carga
  // async en App.tsx), rehidratamos el form. NO sobreescribimos si el
  // usuario ya empezó a editar (heurística: comparamos contra el form
  // recién hidratado para no clobbear cambios pendientes).
  useEffect(() => {
    setForm({
      tasaAnualDefault:        toPct(catalog.tasaAnualDefault).toString(),
      tasaAnualMin:            toPct(catalog.tasaAnualMin).toString(),
      tasaAnualMax:            toPct(catalog.tasaAnualMax).toString(),
      comisionAperturaDefault: toPct(catalog.comisionAperturaDefault).toString(),
      comisionAperturaMin:     toPct(catalog.comisionAperturaMin).toString(),
      comisionAperturaMax:     toPct(catalog.comisionAperturaMax).toString(),
      gpsMontoDefault:         catalog.gpsMontoDefault.toString(),
      gpsFinanciableDefault:   catalog.gpsFinanciableDefault,
      tasaMoratoriaMultiplier: catalog.tasaMoratoriaMultiplier.toString(),
    });
    setRisks(
      riskPresets.map((p) => ({
        nivel: p.nivel,
        nombre: p.nombre,
        engachePuroPct:  toPct(p.engachePuroPct).toString(),
        depositoPuroPct: toPct(p.depositoPuroPct).toString(),
        engancheFinPct:  toPct(p.engancheFinPct).toString(),
        depositoFinPct:  toPct(p.depositoFinPct).toString(),
        orden: p.orden,
      })),
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [catalog.clave, riskPresets.length]);

  if (!allowed) {
    return (
      <div className="max-w-2xl mx-auto py-12 text-center">
        <Shield size={40} className="mx-auto text-gray-300 mb-3" />
        <h2 className="text-lg font-semibold text-gray-900">Acceso restringido</h2>
        <p className="text-sm text-gray-500 mt-1">
          Solo ADMIN o DIRECTOR pueden editar el catálogo de tasas y comisiones.
        </p>
      </div>
    );
  }

  const setField = <K extends keyof CatalogForm>(k: K, v: CatalogForm[K]) =>
    setForm((f) => ({ ...f, [k]: v }));

  const setRisk = (idx: number, k: keyof RiskForm, v: string | number) =>
    setRisks((arr) => arr.map((r, i) => (i === idx ? { ...r, [k]: v } : r)));

  // Validación local (espejo de las refines del Zod del server) para
  // dar feedback inmediato sin tener que esperar al 400.
  const validate = (): string | null => {
    const tDef = Number(form.tasaAnualDefault);
    const tMin = Number(form.tasaAnualMin);
    const tMax = Number(form.tasaAnualMax);
    if ([tDef, tMin, tMax].some((n) => !Number.isFinite(n))) {
      return 'Las tasas deben ser números válidos';
    }
    if (!(tMin <= tDef && tDef <= tMax)) {
      return 'Tasa: min ≤ default ≤ max';
    }
    const cDef = Number(form.comisionAperturaDefault);
    const cMin = Number(form.comisionAperturaMin);
    const cMax = Number(form.comisionAperturaMax);
    if ([cDef, cMin, cMax].some((n) => !Number.isFinite(n))) {
      return 'La comisión debe ser un número válido';
    }
    if (!(cMin <= cDef && cDef <= cMax)) {
      return 'Comisión: min ≤ default ≤ max';
    }
    if (Number(form.gpsMontoDefault) < 0) {
      return 'GPS no puede ser negativo';
    }
    const mor = Number(form.tasaMoratoriaMultiplier);
    if (!(mor >= 1 && mor <= 5)) {
      return 'Multiplicador moratoria debe estar entre 1 y 5';
    }
    for (const r of risks) {
      if (!r.nombre.trim()) {
        return `Riesgo ${r.nivel}: nombre obligatorio`;
      }
      const vals = [r.engachePuroPct, r.depositoPuroPct, r.engancheFinPct, r.depositoFinPct].map(Number);
      if (vals.some((n) => !Number.isFinite(n) || n < 0 || n > 100)) {
        return `Riesgo ${r.nivel}: porcentajes inválidos (0-100)`;
      }
    }
    return null;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccess(null);

    const v = validate();
    if (v) {
      setError(v);
      return;
    }

    setSaving(true);
    try {
      // Catalog: convertir % → fracciones, GPS y multiplier directos.
      const catalogPayload = {
        tasaAnualDefault:        fromPct(form.tasaAnualDefault),
        tasaAnualMin:            fromPct(form.tasaAnualMin),
        tasaAnualMax:            fromPct(form.tasaAnualMax),
        comisionAperturaDefault: fromPct(form.comisionAperturaDefault),
        comisionAperturaMin:     fromPct(form.comisionAperturaMin),
        comisionAperturaMax:     fromPct(form.comisionAperturaMax),
        gpsMontoDefault:         Number(form.gpsMontoDefault),
        gpsFinanciableDefault:   form.gpsFinanciableDefault,
        tasaMoratoriaMultiplier: Number(form.tasaMoratoriaMultiplier),
      };

      // PUTs en paralelo. Si alguna falla, reportamos y NO recargamos.
      // El cache viejo se conserva para no dejar al cotizador con
      // datos inconsistentes (parcialmente actualizados).
      await Promise.all([
        api.put('/config/catalog', catalogPayload),
        ...risks.map((r) =>
          api.put(`/config/catalog/risk/${r.nivel}`, {
            nombre:          r.nombre.trim(),
            engachePuroPct:  fromPct(r.engachePuroPct),
            depositoPuroPct: fromPct(r.depositoPuroPct),
            engancheFinPct:  fromPct(r.engancheFinPct),
            depositoFinPct:  fromPct(r.depositoFinPct),
            orden:           r.orden,
          }),
        ),
      ]);

      await reloadCatalog();
      setSuccess('Catálogo actualizado. Los cambios aplican a las próximas cotizaciones.');
    } catch (err: any) {
      const msg =
        err?.response?.data?.error?.message ||
        err?.response?.data?.error ||
        err?.message ||
        'No se pudo guardar el catálogo';
      setError(typeof msg === 'string' ? msg : 'Error al guardar');
    } finally {
      setSaving(false);
    }
  };

  const handleReset = () => {
    if (!confirm('¿Descartar cambios y restablecer al último valor guardado?')) return;
    setError(null);
    setSuccess(null);
    setForm({
      tasaAnualDefault:        toPct(catalog.tasaAnualDefault).toString(),
      tasaAnualMin:            toPct(catalog.tasaAnualMin).toString(),
      tasaAnualMax:            toPct(catalog.tasaAnualMax).toString(),
      comisionAperturaDefault: toPct(catalog.comisionAperturaDefault).toString(),
      comisionAperturaMin:     toPct(catalog.comisionAperturaMin).toString(),
      comisionAperturaMax:     toPct(catalog.comisionAperturaMax).toString(),
      gpsMontoDefault:         catalog.gpsMontoDefault.toString(),
      gpsFinanciableDefault:   catalog.gpsFinanciableDefault,
      tasaMoratoriaMultiplier: catalog.tasaMoratoriaMultiplier.toString(),
    });
    setRisks(
      riskPresets.map((p) => ({
        nivel: p.nivel,
        nombre: p.nombre,
        engachePuroPct:  toPct(p.engachePuroPct).toString(),
        depositoPuroPct: toPct(p.depositoPuroPct).toString(),
        engancheFinPct:  toPct(p.engancheFinPct).toString(),
        depositoFinPct:  toPct(p.depositoFinPct).toString(),
        orden: p.orden,
      })),
    );
  };

  const updatedAtFmt = catalog.updatedAt
    ? new Date(catalog.updatedAt).toLocaleString('es-MX', { dateStyle: 'medium', timeStyle: 'short' })
    : '—';

  return (
    <form onSubmit={handleSubmit} className="max-w-4xl mx-auto">
      <div className="mb-6">
        <h1 className="text-xl font-bold text-gray-900 flex items-center gap-2">
          <Settings size={20} className="text-inyecta-700" />
          Catálogo de tasas, comisiones y GPS
        </h1>
        <p className="text-sm text-gray-500 mt-1">
          Defaults que el cotizador usa para arrancar cada cotización nueva.
          Los cambios aplican inmediatamente en futuras cotizaciones — las
          ya creadas conservan su tasa.
        </p>
        <p className="text-xs text-gray-400 mt-1">
          Última actualización: <span className="font-medium">{updatedAtFmt}</span>
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

      {/* ── Sección 1: Tasa anual ─────────────────────────────────── */}
      <div className="bg-white rounded-xl border border-gray-200 p-6 mb-4">
        <div className="flex items-start gap-3 mb-4">
          <div className="w-10 h-10 rounded-lg bg-inyecta-50 flex items-center justify-center">
            <Percent size={18} className="text-inyecta-700" />
          </div>
          <div>
            <h3 className="font-semibold text-gray-900">Tasa anual ordinaria</h3>
            <p className="text-xs text-gray-500 mt-0.5">
              Tasa de interés anual que se aplica al capital. La moratoria
              se calcula automáticamente como múltiplo de esta tasa
              (ver más abajo).
            </p>
          </div>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <PctField
            label="Default"
            value={form.tasaAnualDefault}
            onChange={(v) => setField('tasaAnualDefault', v)}
            hint="Tasa pre-cargada en el cotizador"
          />
          <PctField
            label="Mínimo"
            value={form.tasaAnualMin}
            onChange={(v) => setField('tasaAnualMin', v)}
            hint="Cotizador no acepta menos"
          />
          <PctField
            label="Máximo"
            value={form.tasaAnualMax}
            onChange={(v) => setField('tasaAnualMax', v)}
            hint="Cotizador no acepta más"
          />
        </div>
      </div>

      {/* ── Sección 2: Comisión apertura ──────────────────────────── */}
      <div className="bg-white rounded-xl border border-gray-200 p-6 mb-4">
        <div className="flex items-start gap-3 mb-4">
          <div className="w-10 h-10 rounded-lg bg-inyecta-50 flex items-center justify-center">
            <Banknote size={18} className="text-inyecta-700" />
          </div>
          <div>
            <h3 className="font-semibold text-gray-900">Comisión por apertura</h3>
            <p className="text-xs text-gray-500 mt-0.5">
              Porcentaje sobre baseBien (con enganche descontado). Puede
              cobrarse de contado o financiarse al PMT.
            </p>
          </div>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <PctField
            label="Default"
            value={form.comisionAperturaDefault}
            onChange={(v) => setField('comisionAperturaDefault', v)}
          />
          <PctField
            label="Mínimo"
            value={form.comisionAperturaMin}
            onChange={(v) => setField('comisionAperturaMin', v)}
          />
          <PctField
            label="Máximo"
            value={form.comisionAperturaMax}
            onChange={(v) => setField('comisionAperturaMax', v)}
          />
        </div>
      </div>

      {/* ── Sección 3: GPS y moratoria ────────────────────────────── */}
      <div className="bg-white rounded-xl border border-gray-200 p-6 mb-4">
        <div className="flex items-start gap-3 mb-4">
          <div className="w-10 h-10 rounded-lg bg-inyecta-50 flex items-center justify-center">
            <MapPin size={18} className="text-inyecta-700" />
          </div>
          <div>
            <h3 className="font-semibold text-gray-900">GPS y moratoria</h3>
            <p className="text-xs text-gray-500 mt-0.5">
              Costo del equipo de rastreo y multiplicador para la tasa
              moratoria.
            </p>
          </div>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-3">
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">
              Monto GPS (MXN)
            </label>
            <input
              type="number"
              step="0.01"
              min="0"
              value={form.gpsMontoDefault}
              onChange={(e) => setField('gpsMontoDefault', e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-inyecta-500"
            />
            <p className="text-[11px] text-gray-400 mt-1">Costo del equipo de rastreo por unidad</p>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">
              Multiplicador moratoria
            </label>
            <input
              type="number"
              step="0.1"
              min="1"
              max="5"
              value={form.tasaMoratoriaMultiplier}
              onChange={(e) => setField('tasaMoratoriaMultiplier', e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-inyecta-500"
            />
            <p className="text-[11px] text-gray-400 mt-1">
              tasa moratoria = tasa ordinaria × multiplicador (típico: 2)
            </p>
          </div>
          <div className="flex items-end">
            <label className="flex items-center gap-2 cursor-pointer pb-2">
              <input
                type="checkbox"
                checked={form.gpsFinanciableDefault}
                onChange={(e) => setField('gpsFinanciableDefault', e.target.checked)}
                className="w-4 h-4 rounded text-inyecta-600 focus:ring-inyecta-500"
              />
              <span className="text-sm text-gray-700">GPS financiable por default</span>
            </label>
          </div>
        </div>
      </div>

      {/* ── Sección 4: Presets de riesgo ──────────────────────────── */}
      <div className="bg-white rounded-xl border border-gray-200 p-6 mb-4">
        <div className="flex items-start gap-3 mb-4">
          <div className="w-10 h-10 rounded-lg bg-inyecta-50 flex items-center justify-center">
            <Shield size={18} className="text-inyecta-700" />
          </div>
          <div>
            <h3 className="font-semibold text-gray-900">Presets de riesgo (A / B / C)</h3>
            <p className="text-xs text-gray-500 mt-0.5">
              Combinaciones de enganche y depósito sugeridas por nivel de
              riesgo. El cotizador genera 3 opciones, una por preset.
            </p>
          </div>
        </div>

        <div className="overflow-x-auto -mx-2">
          <table className="min-w-full text-sm">
            <thead>
              <tr className="text-xs font-medium text-gray-500 uppercase">
                <th className="px-2 py-2 text-left">Nivel</th>
                <th className="px-2 py-2 text-left">Nombre</th>
                <th className="px-2 py-2 text-left">Eng. PURO %</th>
                <th className="px-2 py-2 text-left">Dep. PURO %</th>
                <th className="px-2 py-2 text-left">Eng. FIN %</th>
                <th className="px-2 py-2 text-left">Dep. FIN %</th>
              </tr>
            </thead>
            <tbody>
              {risks.map((r, idx) => (
                <tr key={r.nivel} className="border-t border-gray-100">
                  <td className="px-2 py-2 font-semibold text-inyecta-700">{r.nivel}</td>
                  <td className="px-2 py-2">
                    <input
                      type="text"
                      value={r.nombre}
                      onChange={(e) => setRisk(idx, 'nombre', e.target.value)}
                      className="w-full px-2 py-1.5 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-1 focus:ring-inyecta-500"
                    />
                  </td>
                  <td className="px-2 py-2">
                    <PctCell value={r.engachePuroPct} onChange={(v) => setRisk(idx, 'engachePuroPct', v)} />
                  </td>
                  <td className="px-2 py-2">
                    <PctCell value={r.depositoPuroPct} onChange={(v) => setRisk(idx, 'depositoPuroPct', v)} />
                  </td>
                  <td className="px-2 py-2">
                    <PctCell value={r.engancheFinPct} onChange={(v) => setRisk(idx, 'engancheFinPct', v)} />
                  </td>
                  <td className="px-2 py-2">
                    <PctCell value={r.depositoFinPct} onChange={(v) => setRisk(idx, 'depositoFinPct', v)} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* ── Acciones ──────────────────────────────────────────────── */}
      <div className="flex flex-wrap items-center gap-2 mb-8">
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
              Guardar cambios
            </>
          )}
        </button>
        <button
          type="button"
          onClick={handleReset}
          disabled={saving}
          className="flex items-center gap-1.5 px-3 py-2 border border-gray-300 text-gray-700 hover:bg-gray-50 rounded-lg text-sm font-medium disabled:opacity-50"
        >
          <RotateCcw size={14} />
          Descartar
        </button>
        <span className="text-xs text-gray-400 ml-auto">
          Solo afecta cotizaciones nuevas. Las existentes conservan su tasa.
        </span>
      </div>

      {/* ── Sección Proveedores GPS — autocontenida, no comparte el
            form principal porque tiene su propio CRUD por fila. ── */}
      <div className="mt-8 bg-white border border-gray-200 rounded-xl p-5">
        <div className="flex items-center gap-2 mb-4">
          <Navigation size={18} className="text-inyecta-600" />
          <h2 className="text-base font-bold text-gray-800">Proveedores GPS</h2>
        </div>
        <GpsProveedoresSection />
      </div>
    </form>
  );
}

// ── Sub-componentes minimalistas ────────────────────────────────────

function PctField({
  label, value, onChange, hint,
}: {
  label: string; value: string; onChange: (v: string) => void; hint?: string;
}) {
  return (
    <div>
      <label className="block text-xs font-medium text-gray-700 mb-1">{label} (%)</label>
      <div className="relative">
        <input
          type="number"
          step="0.01"
          min="0"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="w-full px-3 py-2 pr-7 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-inyecta-500"
        />
        <span className="absolute right-2 top-1/2 -translate-y-1/2 text-xs text-gray-400">%</span>
      </div>
      {hint && <p className="text-[11px] text-gray-400 mt-1">{hint}</p>}
    </div>
  );
}

function PctCell({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <div className="relative">
      <input
        type="number"
        step="0.01"
        min="0"
        max="100"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-24 px-2 py-1.5 pr-6 border border-gray-300 rounded-md text-sm text-right focus:outline-none focus:ring-1 focus:ring-inyecta-500"
      />
      <span className="absolute right-2 top-1/2 -translate-y-1/2 text-xs text-gray-400">%</span>
    </div>
  );
}
