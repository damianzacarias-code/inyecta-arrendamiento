/**
 * PagareTab — Captura del Pagaré (1:1 con Contract, sólo FIN).
 *
 * Cláusula DÉCIMA TERCERA del FIN: pagaré por la renta global a la
 * orden de LA ARRENDADORA, vencimiento = fin del plazo forzoso, monto
 * = renta × plazo × IVA.
 *
 * El componente sugiere automáticamente el monto y la fecha de
 * vencimiento del contrato, pero permite edición manual si el operador
 * negocia algo distinto.
 */
import { useState, useEffect, useCallback } from 'react';
import api from '@/lib/api';
import { Save, FileSignature } from 'lucide-react';

interface PagareData {
  id?: string;
  numeroPagare: string;
  fechaSuscripcion: string;        // ISO date
  fechaVencimiento: string;
  montoPagare: number;
  lugarSuscripcion?: string | null;
  observaciones?: string | null;
}

interface Props {
  contractId: string;
  contractFolio: string;
  productoIsFinanciero: boolean;
  /** Sugeridos al construir el draft inicial. */
  sugerencias: {
    rentaMensualIVA: number;
    plazo: number;
    fechaFirma?: string | null;
    fechaVencimiento?: string | null;
  };
}

function fmtError(err: unknown): string {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const e = err as any;
  return e?.response?.data?.error?.message ?? e?.response?.data?.error ?? e?.message ?? 'Error desconocido';
}

function todayISO(): string {
  return new Date().toISOString().slice(0, 10);
}

export default function PagareTab({ contractId, contractFolio, productoIsFinanciero, sugerencias }: Props) {
  const [data, setData] = useState<PagareData | null>(null);
  const [draft, setDraft] = useState<PagareData>(() => ({
    numeroPagare: contractFolio,
    fechaSuscripcion: sugerencias.fechaFirma?.slice(0, 10) || todayISO(),
    fechaVencimiento: sugerencias.fechaVencimiento?.slice(0, 10) || todayISO(),
    montoPagare: Number((sugerencias.rentaMensualIVA * sugerencias.plazo).toFixed(2)),
    lugarSuscripcion: 'San Luis Potosí, S.L.P.',
    observaciones: '',
  }));
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await api.get(`/contracts/${contractId}/pagare`);
      const p = res.data.pagare as PagareData;
      setData(p);
      setDraft({
        ...p,
        fechaSuscripcion: p.fechaSuscripcion?.slice(0, 10) || todayISO(),
        fechaVencimiento: p.fechaVencimiento?.slice(0, 10) || todayISO(),
        montoPagare: Number(p.montoPagare),
      });
    } catch (err) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      if ((err as any)?.response?.status === 404) {
        // Sin pagaré previo — ya tenemos el draft con los sugeridos.
        setData(null);
      } else {
        setError(fmtError(err));
      }
    } finally {
      setLoading(false);
    }
  }, [contractId]);

  useEffect(() => { void reload(); }, [reload]);

  const save = async () => {
    setSaving(true);
    setError(null);
    try {
      await api.put(`/contracts/${contractId}/pagare`, {
        numeroPagare: draft.numeroPagare,
        fechaSuscripcion: draft.fechaSuscripcion,
        fechaVencimiento: draft.fechaVencimiento,
        montoPagare: Number(draft.montoPagare),
        lugarSuscripcion: draft.lugarSuscripcion || null,
        observaciones: draft.observaciones || null,
      });
      await reload();
    } catch (err) {
      setError(fmtError(err));
    } finally {
      setSaving(false);
    }
  };

  if (!productoIsFinanciero) {
    return (
      <div className="p-6 bg-amber-50 border border-amber-200 rounded-lg text-sm text-amber-800">
        El pagaré sólo aplica a contratos de Arrendamiento Financiero.
      </div>
    );
  }

  if (loading) return <div className="p-6 text-gray-500">Cargando pagaré…</div>;

  const inputClass = 'px-2 py-1.5 border border-gray-300 rounded text-sm focus:outline-none focus:ring-1 focus:ring-inyecta-500 w-full';

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <FileSignature size={16} className="text-inyecta-600" />
        <h3 className="text-sm font-bold text-gray-700">Pagaré (cláusula DÉCIMA TERCERA)</h3>
        {data && <span className="text-xs text-emerald-600 font-medium">· capturado</span>}
      </div>

      {error && <div className="p-3 rounded bg-red-50 border border-red-200 text-sm text-red-700">{error}</div>}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <label className="flex flex-col gap-1">
          <span className="text-xs text-gray-600">Número de pagaré <span className="text-red-500">*</span></span>
          <input value={draft.numeroPagare} onChange={(e) => setDraft({ ...draft, numeroPagare: e.target.value })} className={inputClass} />
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-xs text-gray-600">Lugar de suscripción</span>
          <input value={draft.lugarSuscripcion ?? ''} onChange={(e) => setDraft({ ...draft, lugarSuscripcion: e.target.value })} className={inputClass} />
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-xs text-gray-600">Fecha de suscripción <span className="text-red-500">*</span></span>
          <input type="date" value={draft.fechaSuscripcion} onChange={(e) => setDraft({ ...draft, fechaSuscripcion: e.target.value })} className={inputClass} />
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-xs text-gray-600">Fecha de vencimiento <span className="text-red-500">*</span></span>
          <input type="date" value={draft.fechaVencimiento} onChange={(e) => setDraft({ ...draft, fechaVencimiento: e.target.value })} className={inputClass} />
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-xs text-gray-600">Monto del pagaré (con IVA) <span className="text-red-500">*</span></span>
          <input
            type="number"
            min={0}
            step="0.01"
            value={draft.montoPagare}
            onChange={(e) => setDraft({ ...draft, montoPagare: Number(e.target.value) })}
            className={inputClass}
          />
          <span className="text-xs text-gray-500">
            Sugerido (renta × plazo): ${(sugerencias.rentaMensualIVA * sugerencias.plazo).toLocaleString('es-MX', { minimumFractionDigits: 2 })}
          </span>
        </label>
      </div>

      <label className="flex flex-col gap-1">
        <span className="text-xs text-gray-600">Observaciones</span>
        <textarea
          value={draft.observaciones ?? ''}
          onChange={(e) => setDraft({ ...draft, observaciones: e.target.value })}
          rows={3}
          className={inputClass}
        />
      </label>

      <div className="flex items-center justify-end">
        <button
          onClick={() => void save()}
          disabled={saving || !draft.numeroPagare || draft.montoPagare <= 0}
          className="flex items-center gap-1.5 px-4 py-2 bg-inyecta-600 hover:bg-inyecta-700 text-white rounded text-sm font-medium disabled:opacity-50"
        >
          <Save size={14} /> {saving ? 'Guardando…' : data ? 'Actualizar pagaré' : 'Crear pagaré'}
        </button>
      </div>
    </div>
  );
}
