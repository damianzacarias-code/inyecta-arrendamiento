import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import api from '@/lib/api';
import { formatCurrency } from '@/lib/utils';
import { AlertTriangle, Download, Phone, Filter } from 'lucide-react';

interface CarteraFila {
  contractId: string;
  folio: string;
  producto: 'PURO' | 'FINANCIERO';
  cliente: string;
  rfc?: string | null;
  nivelRiesgo: string;
  plazo: number;
  rentaMensual: number;
  saldoInsoluto: number;
  totalProgramado: number;
  totalPagado: number;
  periodosVencidos: number;
  diasMaxAtraso: number;
  bucket: 'AL_DIA' | '1_30' | '31_60' | '61_90' | '90_MAS';
}

interface CarteraData {
  totales: {
    contratos: number;
    saldoInsolutoTotal: number;
    rentaMensualTotal: number;
    buckets: { AL_DIA: number; b1_30: number; b31_60: number; b61_90: number; b90_MAS: number };
    porProducto: { PURO: number; FINANCIERO: number };
  };
  filas: CarteraFila[];
}

type BucketFilter = 'TODOS' | '1_30' | '31_60' | '61_90' | '90_MAS';

const BUCKET_BG: Record<string, string> = {
  '1_30':   'bg-amber-100 text-amber-800',
  '31_60':  'bg-orange-100 text-orange-800',
  '61_90':  'bg-red-100 text-red-800',
  '90_MAS': 'bg-rose-200 text-rose-900 font-bold',
};

const BUCKET_LABEL: Record<string, string> = {
  '1_30':   '1-30 días',
  '31_60':  '31-60 días',
  '61_90':  '61-90 días',
  '90_MAS': '+90 días',
};

function exportCSV(filename: string, rows: (string | number)[][]) {
  const csv = rows.map(r =>
    r.map(c => {
      const s = String(c ?? '');
      return s.includes(',') || s.includes('"') ? `"${s.replace(/"/g, '""')}"` : s;
    }).join(',')
  ).join('\n');
  const blob = new Blob(['\ufeff' + csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export default function EstadisticasCarteraVencida() {
  const [data, setData] = useState<CarteraData | null>(null);
  const [loading, setLoading] = useState(true);
  const [filtro, setFiltro] = useState<BucketFilter>('TODOS');

  useEffect(() => {
    api.get('/reports/cartera')
      .then(r => setData(r.data))
      .finally(() => setLoading(false));
  }, []);

  const vencidos = useMemo(() => {
    if (!data) return [];
    return data.filas
      .filter(f => f.bucket !== 'AL_DIA')
      .filter(f => filtro === 'TODOS' || f.bucket === filtro)
      .sort((a, b) => b.diasMaxAtraso - a.diasMaxAtraso);
  }, [data, filtro]);

  const stats = useMemo(() => {
    if (!data) return null;
    const all = data.filas.filter(f => f.bucket !== 'AL_DIA');
    const saldoVencido = all.reduce((s, f) => s + f.saldoInsoluto, 0);
    const indice = data.totales.saldoInsolutoTotal > 0
      ? (saldoVencido / data.totales.saldoInsolutoTotal) * 100
      : 0;
    const rentaAtrasada = all.reduce((s, f) => s + f.rentaMensual * f.periodosVencidos, 0);
    return {
      contratos: all.length,
      saldoVencido,
      indice,
      rentaAtrasada,
      criticos: data.filas.filter(f => f.bucket === '90_MAS').length,
    };
  }, [data]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16">
        <div className="animate-spin rounded-full h-8 w-8 border-2 border-inyecta-600 border-t-transparent" />
      </div>
    );
  }

  if (!data || !stats) {
    return <div className="text-gray-500 text-sm">No fue posible cargar la cartera.</div>;
  }

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
          <AlertTriangle size={24} className="text-red-600" /> Cartera Vencida
        </h1>
        <p className="text-gray-500 text-sm mt-1">
          Contratos con uno o más periodos de atraso. Prioriza la gestión de cobranza.
        </p>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <KPI label="Contratos vencidos" value={stats.contratos.toString()} red />
        <KPI label="Saldo vencido" value={formatCurrency(stats.saldoVencido)} red />
        <KPI label="Índice de morosidad" value={`${stats.indice.toFixed(2)}%`} accent />
        <KPI label="Críticos +90d" value={stats.criticos.toString()} red />
      </div>

      {/* Distribución por bucket */}
      <div className="bg-white rounded-xl border border-gray-200 p-4">
        <h3 className="text-sm font-semibold text-gray-900 mb-3">Distribución por días de atraso</h3>
        <div className="grid grid-cols-4 gap-2">
          <BucketCard label="1-30 días"  count={data.totales.buckets.b1_30}  color="amber"  active={filtro === '1_30'}   onClick={() => setFiltro(filtro === '1_30' ? 'TODOS' : '1_30')} />
          <BucketCard label="31-60 días" count={data.totales.buckets.b31_60} color="orange" active={filtro === '31_60'}  onClick={() => setFiltro(filtro === '31_60' ? 'TODOS' : '31_60')} />
          <BucketCard label="61-90 días" count={data.totales.buckets.b61_90} color="red"    active={filtro === '61_90'}  onClick={() => setFiltro(filtro === '61_90' ? 'TODOS' : '61_90')} />
          <BucketCard label="+90 días"   count={data.totales.buckets.b90_MAS} color="rose"  active={filtro === '90_MAS'} onClick={() => setFiltro(filtro === '90_MAS' ? 'TODOS' : '90_MAS')} />
        </div>
      </div>

      {/* Tabla */}
      <div className="bg-white rounded-xl border border-gray-200">
        <div className="flex items-center justify-between p-4 border-b border-gray-100">
          <h3 className="font-semibold text-gray-900 text-sm flex items-center gap-2">
            Detalle de contratos vencidos
            {filtro !== 'TODOS' && (
              <span className="text-[10px] font-normal bg-gray-100 text-gray-600 px-2 py-0.5 rounded flex items-center gap-1">
                <Filter size={10} /> {BUCKET_LABEL[filtro]}
                <button onClick={() => setFiltro('TODOS')} className="ml-1 text-gray-400 hover:text-gray-700">×</button>
              </span>
            )}
          </h3>
          <button
            onClick={() => exportCSV(
              `cartera_vencida_${new Date().toISOString().slice(0,10)}.csv`,
              [
                ['Folio', 'Cliente', 'RFC', 'Producto', 'Riesgo', 'Renta', 'Saldo', 'Periodos vencidos', 'Días atraso', 'Bucket'],
                ...vencidos.map(f => [
                  f.folio, f.cliente, f.rfc || '', f.producto, f.nivelRiesgo,
                  f.rentaMensual, f.saldoInsoluto, f.periodosVencidos, f.diasMaxAtraso, f.bucket,
                ]),
              ]
            )}
            className="text-xs text-inyecta-600 hover:underline flex items-center gap-1"
          >
            <Download size={12} /> Exportar CSV
          </button>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-xs min-w-[800px]">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-200">
                <th className="text-left px-3 py-2 font-medium text-gray-500">Folio</th>
                <th className="text-left px-3 py-2 font-medium text-gray-500">Cliente</th>
                <th className="text-center px-3 py-2 font-medium text-gray-500">Producto</th>
                <th className="text-center px-3 py-2 font-medium text-gray-500">Riesgo</th>
                <th className="text-right px-3 py-2 font-medium text-gray-500">Renta</th>
                <th className="text-right px-3 py-2 font-medium text-gray-500">Saldo</th>
                <th className="text-center px-3 py-2 font-medium text-gray-500">Vencidos</th>
                <th className="text-center px-3 py-2 font-medium text-gray-500">Atraso</th>
                <th className="text-center px-3 py-2 font-medium text-gray-500">Acción</th>
              </tr>
            </thead>
            <tbody>
              {vencidos.map(f => (
                <tr key={f.contractId} className="border-b border-gray-50 hover:bg-gray-50">
                  <td className="px-3 py-2">
                    <Link to={`/contratos/${f.contractId}`} className="text-inyecta-600 hover:underline font-medium">
                      {f.folio}
                    </Link>
                  </td>
                  <td className="px-3 py-2">
                    <div className="text-gray-700">{f.cliente}</div>
                    {f.rfc && <div className="text-[10px] text-gray-400">{f.rfc}</div>}
                  </td>
                  <td className="px-3 py-2 text-center">
                    <span className={`text-[10px] px-1.5 py-0.5 rounded ${
                      f.producto === 'PURO' ? 'bg-cyan-100 text-cyan-700' : 'bg-violet-100 text-violet-700'
                    }`}>
                      {f.producto === 'PURO' ? 'Puro' : 'Financ.'}
                    </span>
                  </td>
                  <td className="px-3 py-2 text-center">
                    <span className="text-[10px] px-1.5 py-0.5 rounded bg-gray-100 text-gray-700 font-medium">{f.nivelRiesgo}</span>
                  </td>
                  <td className="px-3 py-2 text-right text-gray-700">{formatCurrency(f.rentaMensual)}</td>
                  <td className="px-3 py-2 text-right font-medium text-gray-900">{formatCurrency(f.saldoInsoluto)}</td>
                  <td className="px-3 py-2 text-center text-gray-700 font-medium">{f.periodosVencidos}</td>
                  <td className="px-3 py-2 text-center">
                    <span className={`text-[10px] px-1.5 py-0.5 rounded ${BUCKET_BG[f.bucket]}`}>
                      {f.diasMaxAtraso}d
                    </span>
                  </td>
                  <td className="px-3 py-2 text-center">
                    <Link
                      to={`/cobranza/contrato/${f.contractId}`}
                      className="inline-flex items-center gap-1 text-[10px] text-inyecta-600 hover:underline"
                    >
                      <Phone size={10} /> Gestionar
                    </Link>
                  </td>
                </tr>
              ))}
              {vencidos.length === 0 && (
                <tr>
                  <td colSpan={9} className="px-3 py-12 text-center text-gray-400">
                    {filtro === 'TODOS'
                      ? '¡Sin cartera vencida! Toda la cartera está al día.'
                      : `Sin contratos en el rango ${BUCKET_LABEL[filtro]}`}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

function KPI({ label, value, accent, red }: { label: string; value: string; accent?: boolean; red?: boolean }) {
  return (
    <div className="bg-white rounded-xl border border-gray-200 p-4">
      <p className="text-xs text-gray-500">{label}</p>
      <p className={`text-xl font-bold mt-1 ${red ? 'text-red-600' : accent ? 'text-inyecta-700' : 'text-gray-900'}`}>{value}</p>
    </div>
  );
}

function BucketCard({ label, count, color, active, onClick }: { label: string; count: number; color: string; active: boolean; onClick: () => void }) {
  const bg: Record<string, string> = {
    amber:  'bg-amber-50 text-amber-800 border-amber-200 hover:bg-amber-100',
    orange: 'bg-orange-50 text-orange-800 border-orange-200 hover:bg-orange-100',
    red:    'bg-red-50 text-red-800 border-red-200 hover:bg-red-100',
    rose:   'bg-rose-50 text-rose-900 border-rose-200 hover:bg-rose-100',
  };
  return (
    <button
      onClick={onClick}
      className={`text-left rounded-lg border p-3 transition ${bg[color]} ${active ? 'ring-2 ring-offset-1 ring-gray-700' : ''}`}
    >
      <p className="text-2xl font-bold">{count}</p>
      <p className="text-[10px] mt-0.5 uppercase tracking-wide font-medium">{label}</p>
    </button>
  );
}
