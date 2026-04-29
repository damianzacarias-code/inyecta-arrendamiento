import { useState, useEffect } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import api from '@/lib/api';
import { formatCurrency } from '@/lib/utils';
import {
  BarChart3, Wallet, TrendingUp, AlertTriangle, FileBarChart, Download,
} from 'lucide-react';

type Tab = 'cartera' | 'cobranza' | 'rentabilidad';

/**
 * Resuelve el tab activo en función del último segmento de la URL.
 *   /reportes                    → cartera   (default)
 *   /reportes/cartera-vencida    → cartera
 *   /reportes/cobranza           → cobranza
 *   /reportes/rentabilidad       → rentabilidad
 */
function tabFromPath(pathname: string): Tab {
  const seg = pathname.split('/').pop() || '';
  if (seg === 'cobranza')      return 'cobranza';
  if (seg === 'rentabilidad')  return 'rentabilidad';
  return 'cartera';
}

const TAB_PATH: Record<Tab, string> = {
  cartera:      '/reportes/cartera-vencida',
  cobranza:     '/reportes/cobranza',
  rentabilidad: '/reportes/rentabilidad',
};

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

interface CobranzaMes {
  mes: number;
  programado: number;
  cobrado: number;
  moratorios: number;
  eficiencia: number;
}

interface CobranzaData {
  year: number;
  meses: CobranzaMes[];
  totales: { programadoAnual: number; cobradoAnual: number; moratoriosAnual: number };
  eficienciaAnual: number;
}

interface RentabilidadFila {
  contractId: string;
  folio: string;
  producto: 'PURO' | 'FINANCIERO';
  cliente: string;
  montoFinanciado: number;
  tasaAnual: number;
  plazo: number;
  interesesProgramados: number;
  comisionApertura: number;
  ingresoTotalEstimado: number;
  rendimientoSobreMonto: number;
  estatus: string;
}

interface RentabilidadData {
  totales: { contratos: number; montoFinanciadoTotal: number; interesesTotales: number; comisionesTotales: number; ingresoTotal: number };
  filas: RentabilidadFila[];
}

const MESES = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];

const BUCKET_COLORS: Record<string, string> = {
  AL_DIA: 'bg-emerald-100 text-emerald-700',
  '1_30': 'bg-amber-100 text-amber-700',
  '31_60': 'bg-orange-100 text-orange-700',
  '61_90': 'bg-red-100 text-red-700',
  '90_MAS': 'bg-rose-200 text-rose-800',
};

function downloadCSV(filename: string, rows: (string | number)[][]) {
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

export default function ReportesHub() {
  const location = useLocation();
  const navigate = useNavigate();
  const tab = tabFromPath(location.pathname);
  const setTab = (t: Tab) => navigate(TAB_PATH[t]);

  const [cartera, setCartera] = useState<CarteraData | null>(null);
  const [cobranza, setCobranza] = useState<CobranzaData | null>(null);
  const [rentabilidad, setRentabilidad] = useState<RentabilidadData | null>(null);
  const [loading, setLoading] = useState(false);
  const [year, setYear] = useState(new Date().getFullYear());

  useEffect(() => {
    if (tab === 'cartera' && !cartera) {
      setLoading(true);
      api.get('/reports/cartera').then(r => setCartera(r.data)).finally(() => setLoading(false));
    } else if (tab === 'cobranza') {
      setLoading(true);
      api.get(`/reports/cobranza-mensual?year=${year}`).then(r => setCobranza(r.data)).finally(() => setLoading(false));
    } else if (tab === 'rentabilidad' && !rentabilidad) {
      setLoading(true);
      api.get('/reports/rentabilidad').then(r => setRentabilidad(r.data)).finally(() => setLoading(false));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab, year]);

  // Título dinámico según la tab activa — antes h1 decía "Reportes" en
  // cualquier sub-ruta del Hub, lo cual confundía al operador (parecía
  // que /reportes/cobranza no resolvía). Ahora refleja el contenido.
  const titulo =
    tab === 'cobranza' ? 'Cobranza Mensual'
      : tab === 'rentabilidad' ? 'Rentabilidad'
      : 'Cartera Vencida';

  return (
    <div className="max-w-6xl mx-auto">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
          <FileBarChart size={24} className="text-inyecta-600" /> {titulo}
        </h1>
        <p className="text-gray-500 text-sm mt-1">Indicadores operativos y financieros del portafolio.</p>
      </div>

      {/* Tabs */}
      <div className="flex gap-2 mb-6 border-b border-gray-200">
        {([
          { id: 'cartera', label: 'Cartera Vencida', icon: Wallet },
          { id: 'cobranza', label: 'Cobranza Mensual', icon: BarChart3 },
          { id: 'rentabilidad', label: 'Rentabilidad', icon: TrendingUp },
        ] as const).map(t => {
          const Icon = t.icon;
          return (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={`flex items-center gap-1.5 px-4 py-2 text-sm font-medium border-b-2 transition ${
                tab === t.id
                  ? 'text-inyecta-600 border-inyecta-600'
                  : 'text-gray-500 border-transparent hover:text-gray-700'
              }`}
            >
              <Icon size={14} /> {t.label}
            </button>
          );
        })}
      </div>

      {loading && (
        <div className="flex items-center justify-center py-16">
          <div className="animate-spin rounded-full h-8 w-8 border-2 border-inyecta-600 border-t-transparent" />
        </div>
      )}

      {/* Cartera */}
      {!loading && tab === 'cartera' && cartera && (
        <div className="space-y-4">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <KPI label="Contratos vigentes" value={cartera.totales.contratos.toString()} />
            <KPI label="Saldo insoluto total" value={formatCurrency(cartera.totales.saldoInsolutoTotal)} accent />
            <KPI label="Renta mensual total" value={formatCurrency(cartera.totales.rentaMensualTotal)} />
            <KPI label="Mora >30d" value={(cartera.totales.buckets.b31_60 + cartera.totales.buckets.b61_90 + cartera.totales.buckets.b90_MAS).toString()} red />
          </div>

          <div className="bg-white rounded-xl border border-gray-200 p-4">
            <h3 className="font-semibold text-gray-900 mb-3 flex items-center gap-2">
              <AlertTriangle size={16} className="text-amber-600" /> Distribución por días de atraso
            </h3>
            <div className="grid grid-cols-5 gap-2 text-center text-xs">
              <BucketCard label="Al día" count={cartera.totales.buckets.AL_DIA} color="emerald" />
              <BucketCard label="1-30 días" count={cartera.totales.buckets.b1_30} color="amber" />
              <BucketCard label="31-60 días" count={cartera.totales.buckets.b31_60} color="orange" />
              <BucketCard label="61-90 días" count={cartera.totales.buckets.b61_90} color="red" />
              <BucketCard label=">90 días" count={cartera.totales.buckets.b90_MAS} color="rose" />
            </div>
          </div>

          <div className="bg-white rounded-xl border border-gray-200">
            <div className="flex items-center justify-between p-4 border-b border-gray-100">
              <h3 className="font-semibold text-gray-900">Detalle por contrato</h3>
              <button
                onClick={() => downloadCSV(
                  `cartera_${new Date().toISOString().slice(0,10)}.csv`,
                  [
                    ['Folio', 'Cliente', 'Producto', 'Plazo', 'Renta', 'Saldo', 'Pagado', 'Vencidos', 'DiasAtraso', 'Bucket'],
                    ...cartera.filas.map(f => [
                      f.folio, f.cliente, f.producto, f.plazo, f.rentaMensual,
                      f.saldoInsoluto, f.totalPagado, f.periodosVencidos, f.diasMaxAtraso, f.bucket,
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
                    <th className="text-right px-3 py-2 font-medium text-gray-500">Renta</th>
                    <th className="text-right px-3 py-2 font-medium text-gray-500">Saldo</th>
                    <th className="text-right px-3 py-2 font-medium text-gray-500">Pagado</th>
                    <th className="text-center px-3 py-2 font-medium text-gray-500">Atraso</th>
                  </tr>
                </thead>
                <tbody>
                  {cartera.filas.map(f => (
                    <tr key={f.contractId} className="border-b border-gray-50 hover:bg-gray-50">
                      <td className="px-3 py-2">
                        <Link to={`/contratos/${f.contractId}`} className="text-inyecta-600 hover:underline font-medium">
                          {f.folio}
                        </Link>
                      </td>
                      <td className="px-3 py-2 text-gray-700">{f.cliente}</td>
                      <td className="px-3 py-2 text-center">
                        <span className={`text-[10px] px-1.5 py-0.5 rounded ${
                          f.producto === 'PURO' ? 'bg-cyan-100 text-cyan-700' : 'bg-violet-100 text-violet-700'
                        }`}>
                          {f.producto === 'PURO' ? 'Puro' : 'Financ.'}
                        </span>
                      </td>
                      <td className="px-3 py-2 text-right text-gray-700">{formatCurrency(f.rentaMensual)}</td>
                      <td className="px-3 py-2 text-right font-medium text-gray-900">{formatCurrency(f.saldoInsoluto)}</td>
                      <td className="px-3 py-2 text-right text-emerald-700">{formatCurrency(f.totalPagado)}</td>
                      <td className="px-3 py-2 text-center">
                        <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded ${BUCKET_COLORS[f.bucket]}`}>
                          {f.diasMaxAtraso > 0 ? `${f.diasMaxAtraso}d` : 'AL DÍA'}
                        </span>
                      </td>
                    </tr>
                  ))}
                  {cartera.filas.length === 0 && (
                    <tr><td colSpan={7} className="px-3 py-8 text-center text-gray-400">Sin contratos vigentes</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* Cobranza Mensual */}
      {!loading && tab === 'cobranza' && cobranza && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 flex-1">
              <KPI label="Programado anual" value={formatCurrency(cobranza.totales.programadoAnual)} />
              <KPI label="Cobrado anual" value={formatCurrency(cobranza.totales.cobradoAnual)} accent />
              <KPI label="Moratorios cobrados" value={formatCurrency(cobranza.totales.moratoriosAnual)} red />
              <KPI label="Eficiencia" value={`${cobranza.eficienciaAnual}%`} accent />
            </div>
            <select
              value={year}
              onChange={(e) => setYear(Number(e.target.value))}
              className="ml-3 border border-gray-300 rounded-lg px-3 py-2 text-sm"
            >
              {[2024, 2025, 2026, 2027].map(y => <option key={y} value={y}>{y}</option>)}
            </select>
          </div>

          <div className="bg-white rounded-xl border border-gray-200">
            <div className="flex items-center justify-between p-4 border-b border-gray-100">
              <h3 className="font-semibold text-gray-900">Cobranza por mes — {cobranza.year}</h3>
              <button
                onClick={() => downloadCSV(
                  `cobranza_${cobranza.year}.csv`,
                  [['Mes', 'Programado', 'Cobrado', 'Moratorios', 'Eficiencia%'], ...cobranza.meses.map(m => [
                    MESES[m.mes - 1], m.programado, m.cobrado, m.moratorios, m.eficiencia,
                  ])]
                )}
                className="text-xs text-inyecta-600 hover:underline flex items-center gap-1"
              >
                <Download size={12} /> Exportar CSV
              </button>
            </div>
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-50 border-b border-gray-200 text-xs">
                  <th className="text-left px-4 py-2 font-medium text-gray-500">Mes</th>
                  <th className="text-right px-4 py-2 font-medium text-gray-500">Programado</th>
                  <th className="text-right px-4 py-2 font-medium text-gray-500">Cobrado</th>
                  <th className="text-right px-4 py-2 font-medium text-gray-500">Moratorios</th>
                  <th className="text-right px-4 py-2 font-medium text-gray-500">Eficiencia</th>
                </tr>
              </thead>
              <tbody>
                {cobranza.meses.map(m => (
                  <tr key={m.mes} className="border-b border-gray-50">
                    <td className="px-4 py-2 font-medium text-gray-700">{MESES[m.mes - 1]}</td>
                    <td className="px-4 py-2 text-right text-gray-600">{formatCurrency(m.programado)}</td>
                    <td className="px-4 py-2 text-right text-emerald-700 font-medium">{formatCurrency(m.cobrado)}</td>
                    <td className="px-4 py-2 text-right text-amber-700">{formatCurrency(m.moratorios)}</td>
                    <td className="px-4 py-2 text-right">
                      <span className={`text-xs font-medium ${
                        m.eficiencia >= 95 ? 'text-emerald-700' :
                        m.eficiencia >= 80 ? 'text-amber-700' :
                        m.eficiencia > 0 ? 'text-red-700' : 'text-gray-400'
                      }`}>
                        {m.programado > 0 ? `${m.eficiencia}%` : '—'}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Rentabilidad */}
      {!loading && tab === 'rentabilidad' && rentabilidad && (
        <div className="space-y-4">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <KPI label="Contratos" value={rentabilidad.totales.contratos.toString()} />
            <KPI label="Monto financiado" value={formatCurrency(rentabilidad.totales.montoFinanciadoTotal)} />
            <KPI label="Intereses programados" value={formatCurrency(rentabilidad.totales.interesesTotales)} accent />
            <KPI label="Ingreso total estimado" value={formatCurrency(rentabilidad.totales.ingresoTotal)} accent />
          </div>

          <div className="bg-white rounded-xl border border-gray-200">
            <div className="flex items-center justify-between p-4 border-b border-gray-100">
              <h3 className="font-semibold text-gray-900">Rentabilidad por contrato</h3>
              <button
                onClick={() => downloadCSV(
                  `rentabilidad_${new Date().toISOString().slice(0,10)}.csv`,
                  [['Folio', 'Cliente', 'Producto', 'Monto', 'Tasa', 'Plazo', 'Intereses', 'Comision', 'Ingreso', 'Rendimiento%', 'Estatus'],
                  ...rentabilidad.filas.map(f => [
                    f.folio, f.cliente, f.producto, f.montoFinanciado, f.tasaAnual,
                    f.plazo, f.interesesProgramados, f.comisionApertura, f.ingresoTotalEstimado,
                    f.rendimientoSobreMonto, f.estatus,
                  ])]
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
                    <th className="text-right px-3 py-2 font-medium text-gray-500">Monto</th>
                    <th className="text-right px-3 py-2 font-medium text-gray-500">Intereses</th>
                    <th className="text-right px-3 py-2 font-medium text-gray-500">Comisión</th>
                    <th className="text-right px-3 py-2 font-medium text-gray-500">Ingreso</th>
                    <th className="text-right px-3 py-2 font-medium text-gray-500">Rend.</th>
                  </tr>
                </thead>
                <tbody>
                  {rentabilidad.filas.map(f => (
                    <tr key={f.contractId} className="border-b border-gray-50 hover:bg-gray-50">
                      <td className="px-3 py-2">
                        <Link to={`/contratos/${f.contractId}`} className="text-inyecta-600 hover:underline font-medium">
                          {f.folio}
                        </Link>
                      </td>
                      <td className="px-3 py-2 text-gray-700">{f.cliente}</td>
                      <td className="px-3 py-2 text-right">{formatCurrency(f.montoFinanciado)}</td>
                      <td className="px-3 py-2 text-right text-emerald-700">{formatCurrency(f.interesesProgramados)}</td>
                      <td className="px-3 py-2 text-right text-amber-700">{formatCurrency(f.comisionApertura)}</td>
                      <td className="px-3 py-2 text-right font-medium text-gray-900">{formatCurrency(f.ingresoTotalEstimado)}</td>
                      <td className="px-3 py-2 text-right text-violet-700 font-medium">{f.rendimientoSobreMonto}%</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function KPI({ label, value, accent, red }: { label: string; value: string; accent?: boolean; red?: boolean }) {
  return (
    <div className="bg-white rounded-xl border border-gray-200 p-4">
      <p className="text-xs text-gray-500">{label}</p>
      <p className={`text-xl font-bold mt-1 ${
        red ? 'text-red-600' : accent ? 'text-inyecta-700' : 'text-gray-900'
      }`}>
        {value}
      </p>
    </div>
  );
}

function BucketCard({ label, count, color }: { label: string; count: number; color: string }) {
  const bg: Record<string, string> = {
    emerald: 'bg-emerald-50 text-emerald-700 border-emerald-200',
    amber: 'bg-amber-50 text-amber-700 border-amber-200',
    orange: 'bg-orange-50 text-orange-700 border-orange-200',
    red: 'bg-red-50 text-red-700 border-red-200',
    rose: 'bg-rose-50 text-rose-700 border-rose-200',
  };
  return (
    <div className={`rounded-lg border p-3 ${bg[color]}`}>
      <p className="text-2xl font-bold">{count}</p>
      <p className="text-[10px] mt-0.5 uppercase tracking-wide">{label}</p>
    </div>
  );
}
