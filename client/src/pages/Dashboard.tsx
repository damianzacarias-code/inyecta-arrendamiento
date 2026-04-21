import { useState, useEffect } from 'react';
import { useAuth } from '@/context/AuthContext';
import { useNavigate, Link } from 'react-router-dom';
import api from '@/lib/api';
import { formatCurrency, formatDate } from '@/lib/utils';
import {
  Calculator, FileText, Users, FolderOpen, CalendarDays,
  AlertTriangle, CheckCircle2, Clock, Building2, User,
  ChevronRight, Plus,
} from 'lucide-react';
import AlertCenter from '@/components/AlertCenter';

interface DashboardData {
  cotizacionesMes: number;
  contratosActivos: number;
  contratosEnProceso: number;
  clientesTotal: number;
  cobranzaPendiente: number;
  cobranzaVencida: number;
  moratoriosTotal: number;
  recentContracts: Array<{
    id: string;
    folio: string;
    etapa: string;
    producto: string;
    bienDescripcion: string;
    rentaMensualIVA: number;
    createdAt: string;
    client: { tipo: string; nombre?: string; apellidoPaterno?: string; razonSocial?: string };
  }>;
  recentQuotations: Array<{
    id: string;
    folio: string;
    producto: string;
    nombreCliente: string;
    rentaMensualIVA: number;
    createdAt: string;
  }>;
  pipeline: Array<{ stage: string; label: string; count: number }>;
}

const quickActions = [
  { name: 'Nueva Cotizacion', icon: Calculator, href: '/cotizador', color: 'bg-inyecta-600' },
  { name: 'Nuevo Contrato', icon: Plus, href: '/contratos/nuevo', color: 'bg-amber-600' },
  { name: 'Clientes', icon: Users, href: '/clientes', color: 'bg-emerald-600' },
  { name: 'Cobranza', icon: CalendarDays, href: '/cobranza', color: 'bg-blue-600' },
];

const STAGE_LABELS: Record<string, string> = {
  SOLICITUD: 'Solicitud',
  ANALISIS_CLIENTE: 'An. Cliente',
  ANALISIS_BIEN: 'An. Bien',
  COMITE: 'Comite',
  FORMALIZACION: 'Formal.',
  DESEMBOLSO: 'Desemb.',
  ACTIVO: 'Activo',
};

export default function Dashboard() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchAll = async () => {
      try {
        const [contractsRes, quotationsRes, clientsRes, calendarRes] = await Promise.all([
          api.get('/contracts?limit=5'),
          api.get('/quotations?limit=5'),
          api.get('/clients?limit=1'),
          api.get(`/cobranza/calendar?month=${new Date().getMonth() + 1}&year=${new Date().getFullYear()}`).catch(() => ({ data: { summary: {} } })),
        ]);

        setData({
          cotizacionesMes: quotationsRes.data.total || 0,
          contratosActivos: contractsRes.data.data?.filter((c: any) => c.estatus === 'VIGENTE').length || 0,
          contratosEnProceso: contractsRes.data.pipeline?.reduce((s: number, p: any) => s + p.count, 0) || 0,
          clientesTotal: clientsRes.data.total || 0,
          cobranzaPendiente: calendarRes.data.summary?.totalPendiente || 0,
          cobranzaVencida: calendarRes.data.summary?.totalVencido || 0,
          moratoriosTotal: calendarRes.data.summary?.totalMoratorio || 0,
          recentContracts: contractsRes.data.data?.slice(0, 4) || [],
          recentQuotations: quotationsRes.data.data?.slice(0, 4) || [],
          pipeline: contractsRes.data.pipeline || [],
        });
      } catch {}
      setLoading(false);
    };
    fetchAll();
  }, []);

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">
          Bienvenido, {user?.nombre}
        </h1>
        <p className="text-gray-500 mt-1">Sistema de Arrendamiento · Inyecta SOFOM</p>
      </div>

      {/* Quick actions */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-6">
        {quickActions.map((action) => (
          <button
            key={action.href}
            onClick={() => navigate(action.href)}
            className="flex items-center gap-3 p-4 bg-white rounded-xl border border-gray-200 hover:border-inyecta-300 hover:shadow-md transition-all text-left group"
          >
            <div className={`${action.color} w-10 h-10 rounded-lg flex items-center justify-center text-white group-hover:scale-105 transition-transform`}>
              <action.icon size={18} />
            </div>
            <span className="font-medium text-gray-800 text-sm">{action.name}</span>
          </button>
        ))}
      </div>

      {/* Centro de Alertas — agrega cobranza vencida + seguros + documentos */}
      <AlertCenter />

      {loading ? (
        <div className="flex items-center justify-center py-12">
          <div className="animate-spin rounded-full h-6 w-6 border-2 border-inyecta-600 border-t-transparent" />
        </div>
      ) : data ? (
        <>
          {/* Stats */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-6">
            <StatCard
              icon={FileText}
              iconColor="text-inyecta-600"
              label="Cotizaciones"
              value={String(data.cotizacionesMes)}
              sub="Total registradas"
            />
            <StatCard
              icon={FolderOpen}
              iconColor="text-amber-600"
              label="Contratos Activos"
              value={String(data.contratosActivos)}
              sub={`${data.contratosEnProceso} en proceso`}
            />
            <StatCard
              icon={Clock}
              iconColor="text-blue-600"
              label="Cobranza Pendiente"
              value={formatCurrency(data.cobranzaPendiente)}
              sub="Este mes"
            />
            <StatCard
              icon={data.cobranzaVencida > 0 ? AlertTriangle : CheckCircle2}
              iconColor={data.cobranzaVencida > 0 ? 'text-red-500' : 'text-emerald-500'}
              label={data.cobranzaVencida > 0 ? 'Cobranza Vencida' : 'Al Corriente'}
              value={data.cobranzaVencida > 0 ? formatCurrency(data.cobranzaVencida) : 'Sin atrasos'}
              sub={data.moratoriosTotal > 0 ? `+${formatCurrency(data.moratoriosTotal)} moratorios` : 'Este mes'}
              alert={data.cobranzaVencida > 0}
            />
          </div>

          {/* Pipeline mini-bar */}
          {data.pipeline.some(p => p.count > 0) && (
            <div className="bg-white rounded-xl border border-gray-200 p-4 mb-6">
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-sm font-semibold text-gray-700">Pipeline de Contratos</h3>
                <Link to="/contratos" className="text-xs text-inyecta-600 hover:underline flex items-center gap-0.5">
                  Ver todos <ChevronRight size={12} />
                </Link>
              </div>
              <div className="flex gap-1">
                {data.pipeline.map((stage) => (
                  <div key={stage.stage} className="flex-1 text-center">
                    <div className={`h-8 rounded flex items-center justify-center text-xs font-bold ${
                      stage.count > 0 ? 'bg-inyecta-100 text-inyecta-700' : 'bg-gray-50 text-gray-400'
                    }`}>
                      {stage.count}
                    </div>
                    <p className="text-[10px] text-gray-500 mt-1">{STAGE_LABELS[stage.stage] || stage.label}</p>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Recent activity */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {/* Recent contracts */}
            <div className="bg-white rounded-xl border border-gray-200 p-5">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-sm font-semibold text-gray-700">Contratos Recientes</h3>
                <Link to="/contratos" className="text-xs text-inyecta-600 hover:underline">Ver todos</Link>
              </div>
              {data.recentContracts.length === 0 ? (
                <p className="text-sm text-gray-400 text-center py-4">Sin contratos</p>
              ) : (
                <div className="space-y-2">
                  {data.recentContracts.map((c) => (
                    <Link
                      key={c.id}
                      to={`/contratos/${c.id}`}
                      className="flex items-center justify-between p-2.5 rounded-lg hover:bg-gray-50 transition-colors"
                    >
                      <div className="flex items-center gap-2.5 min-w-0">
                        <span className="font-mono text-[11px] text-inyecta-700 font-medium">{c.folio}</span>
                        <div className="min-w-0">
                          <p className="text-sm text-gray-900 truncate">{c.bienDescripcion}</p>
                          <p className="text-[11px] text-gray-400 flex items-center gap-1">
                            {c.client.tipo === 'PM' ? <Building2 size={9} /> : <User size={9} />}
                            {c.client.razonSocial || [c.client.nombre, c.client.apellidoPaterno].filter(Boolean).join(' ')}
                          </p>
                        </div>
                      </div>
                      <div className="text-right flex-shrink-0 ml-2">
                        <p className="text-xs font-medium text-gray-900">{formatCurrency(Number(c.rentaMensualIVA))}/m</p>
                        <span className={`text-[10px] px-1.5 py-0.5 rounded ${
                          c.etapa === 'ACTIVO' ? 'bg-emerald-100 text-emerald-700' : 'bg-inyecta-100 text-inyecta-700'
                        }`}>
                          {STAGE_LABELS[c.etapa] || c.etapa}
                        </span>
                      </div>
                    </Link>
                  ))}
                </div>
              )}
            </div>

            {/* Recent quotations */}
            <div className="bg-white rounded-xl border border-gray-200 p-5">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-sm font-semibold text-gray-700">Cotizaciones Recientes</h3>
                <Link to="/cotizaciones" className="text-xs text-inyecta-600 hover:underline">Ver todas</Link>
              </div>
              {data.recentQuotations.length === 0 ? (
                <p className="text-sm text-gray-400 text-center py-4">Sin cotizaciones</p>
              ) : (
                <div className="space-y-2">
                  {data.recentQuotations.map((q) => (
                    <Link
                      key={q.id}
                      to={`/cotizaciones/${q.id}`}
                      className="flex items-center justify-between p-2.5 rounded-lg hover:bg-gray-50 transition-colors"
                    >
                      <div className="flex items-center gap-2.5 min-w-0">
                        <span className="font-mono text-[11px] text-inyecta-700 font-medium">{q.folio}</span>
                        <div className="min-w-0">
                          <p className="text-sm text-gray-900 truncate">{q.nombreCliente}</p>
                          <span className={`text-[10px] px-1.5 py-0.5 rounded ${
                            q.producto === 'PURO' ? 'bg-cyan-100 text-cyan-700' : 'bg-violet-100 text-violet-700'
                          }`}>
                            {q.producto === 'PURO' ? 'Puro' : 'Financiero'}
                          </span>
                        </div>
                      </div>
                      <div className="text-right flex-shrink-0 ml-2">
                        <p className="text-xs font-medium text-gray-900">{formatCurrency(Number(q.rentaMensualIVA))}/m</p>
                        <p className="text-[10px] text-gray-400">{formatDate(q.createdAt)}</p>
                      </div>
                    </Link>
                  ))}
                </div>
              )}
            </div>
          </div>
        </>
      ) : null}
    </div>
  );
}

function StatCard({ icon: Icon, iconColor, label, value, sub, alert }: {
  icon: typeof FileText;
  iconColor: string;
  label: string;
  value: string;
  sub: string;
  alert?: boolean;
}) {
  return (
    <div className={`bg-white rounded-xl border p-4 ${alert ? 'border-red-200' : 'border-gray-200'}`}>
      <div className="flex items-center gap-2 mb-2">
        <Icon size={14} className={iconColor} />
        <span className="text-xs text-gray-500">{label}</span>
      </div>
      <p className={`text-xl font-bold ${alert ? 'text-red-600' : 'text-gray-900'}`}>{value}</p>
      <p className="text-[11px] text-gray-400 mt-0.5">{sub}</p>
    </div>
  );
}
