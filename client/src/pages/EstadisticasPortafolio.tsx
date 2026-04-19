import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import api from '@/lib/api';
import { formatCurrency } from '@/lib/utils';
import { Briefcase, Layers, ShieldAlert, Calendar, Trophy, Download } from 'lucide-react';

interface Bucket { contratos: number; saldoInsoluto: number; rentaMensual: number; montoOriginal: number; }

interface PortafolioData {
  totales: { contratos: number; saldoInsoluto: number; rentaMensual: number; montoOriginado: number; };
  porProducto: { PURO: Bucket; FINANCIERO: Bucket; };
  porRiesgo:   { A: Bucket; B: Bucket; C: Bucket; };
  porPlazo:    Record<string, Bucket>;
  porEtapa:    Record<string, number>;
  topContratos: Array<{
    contractId: string; folio: string; cliente: string;
    producto: 'PURO' | 'FINANCIERO'; saldoInsoluto: number;
    rentaMensual: number; plazo: number;
  }>;
}

const ETAPA_LABEL: Record<string, string> = {
  SOLICITUD: 'Solicitud',
  COMITE: 'Comité',
  CONTRATACION: 'Contratación',
  ENTREGA: 'Entrega',
  VIGENTE: 'Vigente',
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

export default function EstadisticasPortafolio() {
  const [data, setData] = useState<PortafolioData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.get('/reports/portafolio')
      .then(r => setData(r.data))
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16">
        <div className="animate-spin rounded-full h-8 w-8 border-2 border-inyecta-600 border-t-transparent" />
      </div>
    );
  }

  if (!data) {
    return <div className="text-gray-500 text-sm">No fue posible cargar el portafolio.</div>;
  }

  const pctProducto = (b: Bucket) => data.totales.saldoInsoluto > 0
    ? Math.round((b.saldoInsoluto / data.totales.saldoInsoluto) * 100)
    : 0;

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
          <Briefcase size={24} className="text-inyecta-600" /> Portafolio Vigente
        </h1>
        <p className="text-gray-500 text-sm mt-1">
          Composición del portafolio activo: producto, nivel de riesgo, plazo y etapa.
        </p>
      </div>

      {/* KPIs principales */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <KPI label="Contratos vigentes" value={data.totales.contratos.toString()} />
        <KPI label="Saldo insoluto"     value={formatCurrency(data.totales.saldoInsoluto)} accent />
        <KPI label="Renta mensual"      value={formatCurrency(data.totales.rentaMensual)} />
        <KPI label="Monto originado"    value={formatCurrency(data.totales.montoOriginado)} />
      </div>

      {/* Por producto */}
      <Card title="Distribución por producto" icon={<Layers size={16} className="text-inyecta-600" />}>
        <div className="grid grid-cols-2 gap-4">
          <ProductoCard label="Arrendamiento Puro" color="cyan" data={data.porProducto.PURO} pct={pctProducto(data.porProducto.PURO)} />
          <ProductoCard label="Arrendamiento Financiero" color="violet" data={data.porProducto.FINANCIERO} pct={pctProducto(data.porProducto.FINANCIERO)} />
        </div>
      </Card>

      {/* Por riesgo */}
      <Card title="Distribución por nivel de riesgo" icon={<ShieldAlert size={16} className="text-inyecta-600" />}>
        <div className="grid grid-cols-3 gap-3">
          <RiesgoCard letra="A" label="Riesgo bajo (16%)"  color="emerald" data={data.porRiesgo.A} />
          <RiesgoCard letra="B" label="Riesgo medio (21%)" color="amber"   data={data.porRiesgo.B} />
          <RiesgoCard letra="C" label="Riesgo alto (26%)"  color="red"     data={data.porRiesgo.C} />
        </div>
      </Card>

      {/* Por plazo + etapa */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Card title="Por plazo" icon={<Calendar size={16} className="text-inyecta-600" />}>
          <table className="w-full text-sm">
            <thead>
              <tr className="text-xs text-gray-500 border-b border-gray-200">
                <th className="text-left py-1">Plazo</th>
                <th className="text-right py-1">Contratos</th>
                <th className="text-right py-1">Saldo</th>
              </tr>
            </thead>
            <tbody>
              {Object.entries(data.porPlazo)
                .sort((a, b) => parseInt(a[0]) - parseInt(b[0]))
                .map(([plazo, b]) => (
                  <tr key={plazo} className="border-b border-gray-50">
                    <td className="py-1.5 font-medium text-gray-700">{plazo}</td>
                    <td className="py-1.5 text-right text-gray-700">{b.contratos}</td>
                    <td className="py-1.5 text-right text-gray-900 font-medium">{formatCurrency(b.saldoInsoluto)}</td>
                  </tr>
                ))}
              {Object.keys(data.porPlazo).length === 0 && (
                <tr><td colSpan={3} className="py-4 text-center text-gray-400">Sin datos</td></tr>
              )}
            </tbody>
          </table>
        </Card>

        <Card title="Por etapa de pipeline" icon={<Briefcase size={16} className="text-inyecta-600" />}>
          <div className="space-y-1.5">
            {Object.entries(data.porEtapa).map(([etapa, count]) => {
              const pct = data.totales.contratos > 0
                ? Math.round((count / data.totales.contratos) * 100)
                : 0;
              return (
                <div key={etapa}>
                  <div className="flex justify-between text-xs text-gray-700">
                    <span className="font-medium">{ETAPA_LABEL[etapa] || etapa}</span>
                    <span>{count} ({pct}%)</span>
                  </div>
                  <div className="h-2 bg-gray-100 rounded">
                    <div className="h-full bg-inyecta-600 rounded" style={{ width: `${pct}%` }} />
                  </div>
                </div>
              );
            })}
            {Object.keys(data.porEtapa).length === 0 && (
              <div className="py-4 text-center text-gray-400 text-sm">Sin datos</div>
            )}
          </div>
        </Card>
      </div>

      {/* Top 10 contratos */}
      <Card
        title="Top 10 contratos por saldo insoluto"
        icon={<Trophy size={16} className="text-amber-500" />}
        action={
          <button
            onClick={() => exportCSV(
              `portafolio_top_${new Date().toISOString().slice(0,10)}.csv`,
              [
                ['Folio', 'Cliente', 'Producto', 'Plazo', 'Renta', 'Saldo'],
                ...data.topContratos.map(t => [t.folio, t.cliente, t.producto, t.plazo, t.rentaMensual, t.saldoInsoluto]),
              ]
            )}
            className="text-xs text-inyecta-600 hover:underline flex items-center gap-1"
          >
            <Download size={12} /> Exportar CSV
          </button>
        }
      >
        <table className="w-full text-xs">
          <thead>
            <tr className="bg-gray-50 border-b border-gray-200">
              <th className="text-left px-3 py-2 font-medium text-gray-500">#</th>
              <th className="text-left px-3 py-2 font-medium text-gray-500">Folio</th>
              <th className="text-left px-3 py-2 font-medium text-gray-500">Cliente</th>
              <th className="text-center px-3 py-2 font-medium text-gray-500">Producto</th>
              <th className="text-right px-3 py-2 font-medium text-gray-500">Renta</th>
              <th className="text-right px-3 py-2 font-medium text-gray-500">Saldo</th>
            </tr>
          </thead>
          <tbody>
            {data.topContratos.map((t, i) => (
              <tr key={t.contractId} className="border-b border-gray-50 hover:bg-gray-50">
                <td className="px-3 py-2 text-gray-400">{i + 1}</td>
                <td className="px-3 py-2">
                  <Link to={`/contratos/${t.contractId}`} className="text-inyecta-600 hover:underline font-medium">
                    {t.folio}
                  </Link>
                </td>
                <td className="px-3 py-2 text-gray-700">{t.cliente}</td>
                <td className="px-3 py-2 text-center">
                  <span className={`text-[10px] px-1.5 py-0.5 rounded ${
                    t.producto === 'PURO' ? 'bg-cyan-100 text-cyan-700' : 'bg-violet-100 text-violet-700'
                  }`}>
                    {t.producto === 'PURO' ? 'Puro' : 'Financ.'}
                  </span>
                </td>
                <td className="px-3 py-2 text-right text-gray-700">{formatCurrency(t.rentaMensual)}</td>
                <td className="px-3 py-2 text-right font-bold text-gray-900">{formatCurrency(t.saldoInsoluto)}</td>
              </tr>
            ))}
            {data.topContratos.length === 0 && (
              <tr><td colSpan={6} className="px-3 py-8 text-center text-gray-400">Sin contratos vigentes</td></tr>
            )}
          </tbody>
        </table>
      </Card>
    </div>
  );
}

function KPI({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <div className="bg-white rounded-xl border border-gray-200 p-4">
      <p className="text-xs text-gray-500">{label}</p>
      <p className={`text-xl font-bold mt-1 ${accent ? 'text-inyecta-700' : 'text-gray-900'}`}>{value}</p>
    </div>
  );
}

function Card({ title, icon, action, children }: { title: string; icon?: React.ReactNode; action?: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="bg-white rounded-xl border border-gray-200">
      <div className="flex items-center justify-between p-4 border-b border-gray-100">
        <h3 className="font-semibold text-gray-900 flex items-center gap-2 text-sm">
          {icon} {title}
        </h3>
        {action}
      </div>
      <div className="p-4">{children}</div>
    </div>
  );
}

function ProductoCard({ label, color, data, pct }: { label: string; color: 'cyan' | 'violet'; data: Bucket; pct: number }) {
  const bg = color === 'cyan' ? 'bg-cyan-50 border-cyan-200' : 'bg-violet-50 border-violet-200';
  const txt = color === 'cyan' ? 'text-cyan-700' : 'text-violet-700';
  const bar = color === 'cyan' ? 'bg-cyan-500' : 'bg-violet-500';
  return (
    <div className={`rounded-lg border p-4 ${bg}`}>
      <p className={`text-xs font-medium ${txt}`}>{label}</p>
      <p className="text-2xl font-bold text-gray-900 mt-1">{data.contratos}</p>
      <p className="text-xs text-gray-600 mt-2">Saldo: <span className="font-semibold text-gray-900">{formatCurrency(data.saldoInsoluto)}</span></p>
      <p className="text-xs text-gray-600">Renta: {formatCurrency(data.rentaMensual)}</p>
      <div className="mt-2 h-1.5 bg-white rounded-full overflow-hidden">
        <div className={`h-full ${bar}`} style={{ width: `${pct}%` }} />
      </div>
      <p className="text-[10px] text-gray-500 mt-1">{pct}% del saldo total</p>
    </div>
  );
}

function RiesgoCard({ letra, label, color, data }: { letra: string; label: string; color: 'emerald' | 'amber' | 'red'; data: Bucket }) {
  const bg: Record<string, string> = {
    emerald: 'bg-emerald-50 border-emerald-200 text-emerald-700',
    amber:   'bg-amber-50 border-amber-200 text-amber-700',
    red:     'bg-red-50 border-red-200 text-red-700',
  };
  return (
    <div className={`rounded-lg border p-4 ${bg[color]}`}>
      <div className="flex items-baseline gap-2">
        <span className="text-3xl font-bold">{letra}</span>
        <span className="text-xs">{label}</span>
      </div>
      <p className="text-lg font-bold text-gray-900 mt-2">{data.contratos} contratos</p>
      <p className="text-xs text-gray-600 mt-1">{formatCurrency(data.saldoInsoluto)}</p>
    </div>
  );
}
