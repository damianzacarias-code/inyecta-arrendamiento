import { useEffect, useState } from 'react';
import api from '@/lib/api';
import { formatCurrency } from '@/lib/utils';
import {
  Activity, Briefcase, Users, FileBarChart, AlertCircle,
  CalendarClock, Receipt, TrendingUp, ShieldCheck,
} from 'lucide-react';

interface MetricasData {
  portafolio: {
    contratosVigentes: number;
    contratosTerminados: number;
    contratosEnProceso: number;
    cotizacionesVigentes: number;
    clientesActivos: number;
    proximosVencer90d: number;
    saldoInsolutoTotal: number;
    rentaMensualTotal: number;
    interesProgramado: number;
  };
  mes: {
    contratosNuevos: number;
    montoColocado: number;
    comisionesGeneradas: number;
    cobranzaTotal: number;
    moratoriosCobrados: number;
    facturasEmitidas: number;
  };
  anio: {
    anio: number;
    contratosNuevos: number;
    montoColocado: number;
    comisionesGeneradas: number;
    cobranzaTotal: number;
    moratoriosCobrados: number;
  };
  calidad: {
    contratosConMora: number;
    saldoConMora: number;
    indiceMorosidadPct: number;
    moratoriosTotalesAcum: number;
    recaudadoVigentesAcum: number;
  };
}

const MES_ACTUAL = new Intl.DateTimeFormat('es-MX', { month: 'long', year: 'numeric' })
  .format(new Date())
  .replace(/^./, c => c.toUpperCase());

export default function ReportesMetricas() {
  const [data, setData] = useState<MetricasData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.get('/reports/metricas')
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
    return <div className="text-gray-500 text-sm">No fue posible cargar las métricas.</div>;
  }

  const semaforo = data.calidad.indiceMorosidadPct < 5 ? 'emerald'
                : data.calidad.indiceMorosidadPct < 10 ? 'amber'
                : 'red';

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
          <Activity size={24} className="text-inyecta-600" /> Métricas Generales
        </h1>
        <p className="text-gray-500 text-sm mt-1">
          Indicadores ejecutivos del negocio: portafolio, originación, cobranza y calidad.
        </p>
      </div>

      {/* Bloque PORTAFOLIO */}
      <Section title="Portafolio" subtitle="Estado actual" icon={<Briefcase size={16} />}>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <Tile icon={Briefcase}      label="Contratos vigentes"   value={data.portafolio.contratosVigentes.toString()} accent="inyecta" />
          <Tile icon={CalendarClock}  label="En proceso"           value={data.portafolio.contratosEnProceso.toString()} accent="violet" />
          <Tile icon={ShieldCheck}    label="Terminados"           value={data.portafolio.contratosTerminados.toString()} accent="emerald" />
          <Tile icon={FileBarChart}   label="Cotizaciones vigentes" value={data.portafolio.cotizacionesVigentes.toString()} accent="amber" />
          <Tile icon={Users}          label="Clientes activos"     value={data.portafolio.clientesActivos.toString()} accent="cyan" />
          <Tile                       label="Saldo insoluto"       value={formatCurrency(data.portafolio.saldoInsolutoTotal)} accent="inyecta" />
          <Tile                       label="Renta mensual"        value={formatCurrency(data.portafolio.rentaMensualTotal)} accent="emerald" />
          <Tile                       label="Intereses programados" value={formatCurrency(data.portafolio.interesProgramado)} accent="violet" />
        </div>
        {data.portafolio.proximosVencer90d > 0 && (
          <div className="mt-3 flex items-center gap-2 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 text-xs text-amber-800">
            <AlertCircle size={14} />
            <span>
              <strong>{data.portafolio.proximosVencer90d}</strong> contrato{data.portafolio.proximosVencer90d === 1 ? '' : 's'} vence{data.portafolio.proximosVencer90d === 1 ? '' : 'n'} en los próximos 90 días — gestionar renovación u opción de compra.
            </span>
          </div>
        )}
      </Section>

      {/* Bloque MES + AÑO */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Section title="Este mes" subtitle={MES_ACTUAL} icon={<TrendingUp size={16} />}>
          <div className="grid grid-cols-2 gap-3">
            <Tile label="Contratos nuevos"  value={data.mes.contratosNuevos.toString()} accent="inyecta" />
            <Tile label="Monto colocado"    value={formatCurrency(data.mes.montoColocado)} accent="emerald" />
            <Tile label="Comisiones"        value={formatCurrency(data.mes.comisionesGeneradas)} accent="amber" />
            <Tile label="Cobranza"          value={formatCurrency(data.mes.cobranzaTotal)} accent="inyecta" />
            <Tile label="Moratorios"        value={formatCurrency(data.mes.moratoriosCobrados)} accent="red" />
            <Tile icon={Receipt} label="Facturas emitidas" value={data.mes.facturasEmitidas.toString()} accent="violet" />
          </div>
        </Section>

        <Section title={`Año ${data.anio.anio}`} subtitle="Acumulado anual" icon={<TrendingUp size={16} />}>
          <div className="grid grid-cols-2 gap-3">
            <Tile label="Contratos nuevos"  value={data.anio.contratosNuevos.toString()} accent="inyecta" />
            <Tile label="Monto colocado"    value={formatCurrency(data.anio.montoColocado)} accent="emerald" />
            <Tile label="Comisiones"        value={formatCurrency(data.anio.comisionesGeneradas)} accent="amber" />
            <Tile label="Cobranza"          value={formatCurrency(data.anio.cobranzaTotal)} accent="inyecta" />
            <Tile label="Moratorios"        value={formatCurrency(data.anio.moratoriosCobrados)} accent="red" />
            <Tile label="Ticket promedio"   value={data.anio.contratosNuevos > 0 ? formatCurrency(data.anio.montoColocado / data.anio.contratosNuevos) : '—'} accent="violet" />
          </div>
        </Section>
      </div>

      {/* Bloque CALIDAD */}
      <Section title="Calidad de cartera" subtitle="Indicadores de riesgo y morosidad" icon={<ShieldCheck size={16} />}>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {/* Semáforo morosidad */}
          <div className={`rounded-xl border p-4 ${
            semaforo === 'emerald' ? 'bg-emerald-50 border-emerald-200'
            : semaforo === 'amber' ? 'bg-amber-50 border-amber-200'
            : 'bg-red-50 border-red-200'
          }`}>
            <p className={`text-xs font-medium ${
              semaforo === 'emerald' ? 'text-emerald-700'
              : semaforo === 'amber' ? 'text-amber-700'
              : 'text-red-700'
            }`}>Índice de morosidad</p>
            <p className="text-3xl font-bold text-gray-900 mt-1">{data.calidad.indiceMorosidadPct.toFixed(2)}%</p>
            <p className="text-[11px] text-gray-600 mt-1">
              {data.calidad.contratosConMora} contrato{data.calidad.contratosConMora === 1 ? '' : 's'} con atraso · saldo {formatCurrency(data.calidad.saldoConMora)}
            </p>
            <p className="text-[10px] text-gray-500 mt-2 leading-tight">
              {semaforo === 'emerald' ? 'Cartera sana (<5%)'
              : semaforo === 'amber' ? 'Atención (5-10%)'
              : 'Riesgo elevado (≥10%)'}
            </p>
          </div>

          <Tile label="Moratorios cobrados (acum.)" value={formatCurrency(data.calidad.moratoriosTotalesAcum)} accent="amber" />
          <Tile label="Recaudado vigentes (acum.)" value={formatCurrency(data.calidad.recaudadoVigentesAcum)} accent="emerald" />
        </div>
      </Section>
    </div>
  );
}

function Section({ title, subtitle, icon, children }: { title: string; subtitle?: string; icon?: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="bg-white rounded-xl border border-gray-200">
      <div className="p-4 border-b border-gray-100">
        <h3 className="text-sm font-semibold text-gray-900 flex items-center gap-2">
          {icon} {title}
        </h3>
        {subtitle && <p className="text-[11px] text-gray-500 mt-0.5">{subtitle}</p>}
      </div>
      <div className="p-4">{children}</div>
    </div>
  );
}

interface TileProps {
  label: string;
  value: string;
  icon?: React.ComponentType<{ size?: number; className?: string }>;
  accent?: 'inyecta' | 'emerald' | 'amber' | 'red' | 'violet' | 'cyan';
}
function Tile({ label, value, icon: Icon, accent }: TileProps) {
  const text: Record<string, string> = {
    inyecta: 'text-inyecta-700',
    emerald: 'text-emerald-700',
    amber:   'text-amber-700',
    red:     'text-red-700',
    violet:  'text-violet-700',
    cyan:    'text-cyan-700',
  };
  return (
    <div className="bg-gray-50 rounded-lg p-3">
      <div className="flex items-center gap-1.5 text-xs text-gray-500">
        {Icon && <Icon size={12} className="text-gray-400" />}
        <span>{label}</span>
      </div>
      <p className={`text-lg font-bold mt-1 ${accent ? text[accent] : 'text-gray-900'}`}>{value}</p>
    </div>
  );
}
