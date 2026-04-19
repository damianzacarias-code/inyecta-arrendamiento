import { useEffect, useState } from 'react';
import api from '@/lib/api';
import { formatCurrency } from '@/lib/utils';
import { TrendingUp, Download } from 'lucide-react';

interface MesProduccion {
  mes: number;
  contratos: number;
  contratosPuro: number;
  contratosFinanciero: number;
  montoColocado: number;
  rentaMensualNueva: number;
  comisionesGeneradas: number;
  ticketPromedio: number;
  plazoPromedio: number;
}

interface ProduccionData {
  year: number;
  meses: MesProduccion[];
  totales: {
    contratos: number;
    contratosPuro: number;
    contratosFinanciero: number;
    montoColocado: number;
    rentaMensualNueva: number;
    comisionesGeneradas: number;
  };
  ticketPromedioAnual: number;
}

const MESES = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];

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

export default function EstadisticasProduccion() {
  const [data, setData] = useState<ProduccionData | null>(null);
  const [loading, setLoading] = useState(true);
  const [year, setYear] = useState(new Date().getFullYear());

  useEffect(() => {
    setLoading(true);
    api.get(`/reports/produccion-mensual?year=${year}`)
      .then(r => setData(r.data))
      .finally(() => setLoading(false));
  }, [year]);

  const maxMonto = data ? Math.max(...data.meses.map(m => m.montoColocado), 1) : 1;

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
            <TrendingUp size={24} className="text-inyecta-600" /> Producción Mensual
          </h1>
          <p className="text-gray-500 text-sm mt-1">
            Originación de contratos por mes: monto colocado, ticket promedio y mix de productos.
          </p>
        </div>
        <select
          value={year}
          onChange={(e) => setYear(Number(e.target.value))}
          className="border border-gray-300 rounded-lg px-3 py-2 text-sm bg-white"
        >
          {[2024, 2025, 2026, 2027].map(y => <option key={y} value={y}>{y}</option>)}
        </select>
      </div>

      {loading && (
        <div className="flex items-center justify-center py-16">
          <div className="animate-spin rounded-full h-8 w-8 border-2 border-inyecta-600 border-t-transparent" />
        </div>
      )}

      {!loading && data && (
        <>
          {/* KPIs anuales */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <KPI label={`Contratos ${data.year}`} value={data.totales.contratos.toString()} />
            <KPI label="Monto colocado" value={formatCurrency(data.totales.montoColocado)} accent />
            <KPI label="Ticket promedio" value={formatCurrency(data.ticketPromedioAnual)} />
            <KPI label="Comisiones" value={formatCurrency(data.totales.comisionesGeneradas)} accent />
          </div>

          {/* Mix producto */}
          <div className="bg-white rounded-xl border border-gray-200 p-4">
            <h3 className="text-sm font-semibold text-gray-900 mb-3">Mix de productos en {data.year}</h3>
            <div className="flex items-center gap-2">
              {data.totales.contratos > 0 ? (
                <>
                  <div className="flex-1 h-8 rounded-md overflow-hidden flex">
                    <div
                      className="bg-cyan-500 flex items-center justify-center text-white text-xs font-medium"
                      style={{ width: `${(data.totales.contratosPuro / data.totales.contratos) * 100}%` }}
                    >
                      {Math.round((data.totales.contratosPuro / data.totales.contratos) * 100)}%
                    </div>
                    <div
                      className="bg-violet-500 flex items-center justify-center text-white text-xs font-medium"
                      style={{ width: `${(data.totales.contratosFinanciero / data.totales.contratos) * 100}%` }}
                    >
                      {Math.round((data.totales.contratosFinanciero / data.totales.contratos) * 100)}%
                    </div>
                  </div>
                  <div className="text-xs space-y-0.5 min-w-[140px]">
                    <div className="flex items-center gap-1.5">
                      <span className="w-2.5 h-2.5 rounded-sm bg-cyan-500" />
                      <span className="text-gray-700">Puro: <strong>{data.totales.contratosPuro}</strong></span>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <span className="w-2.5 h-2.5 rounded-sm bg-violet-500" />
                      <span className="text-gray-700">Financiero: <strong>{data.totales.contratosFinanciero}</strong></span>
                    </div>
                  </div>
                </>
              ) : (
                <p className="text-gray-400 text-sm">Sin contratos en {data.year}</p>
              )}
            </div>
          </div>

          {/* Gráfico de barras por mes */}
          <div className="bg-white rounded-xl border border-gray-200 p-4">
            <h3 className="text-sm font-semibold text-gray-900 mb-4">Monto colocado por mes</h3>
            <div className="flex items-end gap-2 h-48">
              {data.meses.map(m => {
                const altura = (m.montoColocado / maxMonto) * 100;
                return (
                  <div key={m.mes} className="flex-1 flex flex-col items-center gap-1 h-full">
                    <div className="flex-1 w-full flex items-end">
                      <div
                        className="w-full bg-inyecta-600 rounded-t hover:bg-inyecta-700 transition relative group cursor-default"
                        style={{ height: `${altura}%`, minHeight: m.montoColocado > 0 ? 2 : 0 }}
                      >
                        {m.montoColocado > 0 && (
                          <div className="opacity-0 group-hover:opacity-100 absolute bottom-full mb-1 left-1/2 -translate-x-1/2 bg-gray-900 text-white text-[10px] px-2 py-1 rounded whitespace-nowrap z-10">
                            {formatCurrency(m.montoColocado)} · {m.contratos}c
                          </div>
                        )}
                      </div>
                    </div>
                    <div className="text-[10px] text-gray-500 font-medium">{MESES[m.mes - 1]}</div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Tabla detalle */}
          <div className="bg-white rounded-xl border border-gray-200">
            <div className="flex items-center justify-between p-4 border-b border-gray-100">
              <h3 className="font-semibold text-gray-900 text-sm">Detalle mensual {data.year}</h3>
              <button
                onClick={() => exportCSV(
                  `produccion_${data.year}.csv`,
                  [
                    ['Mes', 'Contratos', 'Puro', 'Financiero', 'MontoColocado', 'RentaNueva', 'Comisiones', 'Ticket', 'PlazoProm'],
                    ...data.meses.map(m => [
                      MESES[m.mes - 1], m.contratos, m.contratosPuro, m.contratosFinanciero,
                      m.montoColocado, m.rentaMensualNueva, m.comisionesGeneradas, m.ticketPromedio, m.plazoPromedio,
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
                    <th className="text-left px-3 py-2 font-medium text-gray-500">Mes</th>
                    <th className="text-center px-3 py-2 font-medium text-gray-500">Contratos</th>
                    <th className="text-center px-3 py-2 font-medium text-gray-500">Puro</th>
                    <th className="text-center px-3 py-2 font-medium text-gray-500">Financ.</th>
                    <th className="text-right px-3 py-2 font-medium text-gray-500">Monto</th>
                    <th className="text-right px-3 py-2 font-medium text-gray-500">Renta nueva</th>
                    <th className="text-right px-3 py-2 font-medium text-gray-500">Comisiones</th>
                    <th className="text-right px-3 py-2 font-medium text-gray-500">Ticket</th>
                    <th className="text-center px-3 py-2 font-medium text-gray-500">Plazo</th>
                  </tr>
                </thead>
                <tbody>
                  {data.meses.map(m => (
                    <tr key={m.mes} className={`border-b border-gray-50 ${m.contratos === 0 ? 'text-gray-300' : ''}`}>
                      <td className="px-3 py-2 font-medium text-gray-700">{MESES[m.mes - 1]}</td>
                      <td className="px-3 py-2 text-center font-medium">{m.contratos || '—'}</td>
                      <td className="px-3 py-2 text-center text-cyan-700">{m.contratosPuro || '—'}</td>
                      <td className="px-3 py-2 text-center text-violet-700">{m.contratosFinanciero || '—'}</td>
                      <td className="px-3 py-2 text-right font-medium">{m.montoColocado ? formatCurrency(m.montoColocado) : '—'}</td>
                      <td className="px-3 py-2 text-right text-emerald-700">{m.rentaMensualNueva ? formatCurrency(m.rentaMensualNueva) : '—'}</td>
                      <td className="px-3 py-2 text-right text-amber-700">{m.comisionesGeneradas ? formatCurrency(m.comisionesGeneradas) : '—'}</td>
                      <td className="px-3 py-2 text-right">{m.ticketPromedio ? formatCurrency(m.ticketPromedio) : '—'}</td>
                      <td className="px-3 py-2 text-center">{m.plazoPromedio ? `${m.plazoPromedio}m` : '—'}</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="bg-gray-50 font-semibold border-t-2 border-gray-200">
                    <td className="px-3 py-2 text-gray-900">Total {data.year}</td>
                    <td className="px-3 py-2 text-center">{data.totales.contratos}</td>
                    <td className="px-3 py-2 text-center text-cyan-700">{data.totales.contratosPuro}</td>
                    <td className="px-3 py-2 text-center text-violet-700">{data.totales.contratosFinanciero}</td>
                    <td className="px-3 py-2 text-right">{formatCurrency(data.totales.montoColocado)}</td>
                    <td className="px-3 py-2 text-right text-emerald-700">{formatCurrency(data.totales.rentaMensualNueva)}</td>
                    <td className="px-3 py-2 text-right text-amber-700">{formatCurrency(data.totales.comisionesGeneradas)}</td>
                    <td className="px-3 py-2 text-right">{formatCurrency(data.ticketPromedioAnual)}</td>
                    <td className="px-3 py-2 text-center">—</td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </div>
        </>
      )}
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
