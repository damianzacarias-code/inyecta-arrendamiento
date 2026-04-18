import { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import api from '@/lib/api';
import { formatCurrency, formatDate } from '@/lib/utils';
import {
  FolderOpen, Plus, Search, Eye, ChevronLeft, ChevronRight,
  Building2, User, FileText, ClipboardCheck, Truck, Users,
  Gavel, PenTool, Banknote, CheckCircle2, Filter,
} from 'lucide-react';

interface ContractRow {
  id: string;
  folio: string;
  producto: 'PURO' | 'FINANCIERO';
  etapa: string;
  estatus: string;
  bienDescripcion: string;
  valorBien: number;
  montoFinanciar: number;
  rentaMensualIVA: number;
  plazo: number;
  nivelRiesgo: string;
  createdAt: string;
  client: {
    id: string;
    tipo: 'PFAE' | 'PM';
    nombre?: string;
    apellidoPaterno?: string;
    razonSocial?: string;
    rfc?: string;
  };
  user: { nombre: string; apellidos: string };
}

interface PipelineStage {
  stage: string;
  label: string;
  count: number;
}

const STAGE_ICONS: Record<string, typeof FileText> = {
  SOLICITUD: FileText,
  ANALISIS_CLIENTE: Users,
  ANALISIS_BIEN: ClipboardCheck,
  COMITE: Gavel,
  FORMALIZACION: PenTool,
  DESEMBOLSO: Banknote,
  ACTIVO: CheckCircle2,
};

const STAGE_COLORS: Record<string, { bg: string; text: string; border: string; dot: string }> = {
  SOLICITUD: { bg: 'bg-slate-50', text: 'text-slate-700', border: 'border-slate-200', dot: 'bg-slate-400' },
  ANALISIS_CLIENTE: { bg: 'bg-blue-50', text: 'text-blue-700', border: 'border-blue-200', dot: 'bg-blue-400' },
  ANALISIS_BIEN: { bg: 'bg-indigo-50', text: 'text-indigo-700', border: 'border-indigo-200', dot: 'bg-indigo-400' },
  COMITE: { bg: 'bg-purple-50', text: 'text-purple-700', border: 'border-purple-200', dot: 'bg-purple-400' },
  FORMALIZACION: { bg: 'bg-amber-50', text: 'text-amber-700', border: 'border-amber-200', dot: 'bg-amber-400' },
  DESEMBOLSO: { bg: 'bg-orange-50', text: 'text-orange-700', border: 'border-orange-200', dot: 'bg-orange-400' },
  ACTIVO: { bg: 'bg-emerald-50', text: 'text-emerald-700', border: 'border-emerald-200', dot: 'bg-emerald-500' },
};

function clientDisplayName(c: ContractRow['client']): string {
  if (c.tipo === 'PM') return c.razonSocial || 'Sin nombre';
  return [c.nombre, c.apellidoPaterno].filter(Boolean).join(' ') || 'Sin nombre';
}

export default function Contratos() {
  const navigate = useNavigate();
  const [contracts, setContracts] = useState<ContractRow[]>([]);
  const [pipeline, setPipeline] = useState<PipelineStage[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pages, setPages] = useState(1);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [etapaFilter, setEtapaFilter] = useState('');
  const [viewMode, setViewMode] = useState<'pipeline' | 'list'>('pipeline');

  useEffect(() => {
    setLoading(true);
    const params = new URLSearchParams({ page: String(page), limit: '50' });
    if (etapaFilter) params.set('etapa', etapaFilter);

    api.get(`/contracts?${params}`)
      .then((res) => {
        setContracts(res.data.data);
        setTotal(res.data.total);
        setPages(res.data.pages);
        setPipeline(res.data.pipeline || []);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [page, etapaFilter]);

  const pipelineTotal = pipeline.reduce((s, p) => s + p.count, 0);

  // Group contracts by stage for pipeline view
  const contractsByStage: Record<string, ContractRow[]> = {};
  pipeline.forEach((p) => { contractsByStage[p.stage] = []; });
  contracts.forEach((c) => {
    if (!contractsByStage[c.etapa]) contractsByStage[c.etapa] = [];
    contractsByStage[c.etapa].push(c);
  });

  // Filtered contracts for search in list mode
  const filteredContracts = search
    ? contracts.filter((c) => {
        const q = search.toLowerCase();
        return (
          c.folio.toLowerCase().includes(q) ||
          c.bienDescripcion.toLowerCase().includes(q) ||
          clientDisplayName(c.client).toLowerCase().includes(q) ||
          (c.client.rfc || '').toLowerCase().includes(q)
        );
      })
    : contracts;

  return (
    <div>
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Contratos</h1>
          <p className="text-gray-500 text-sm mt-1">
            {total} contratos · {pipelineTotal} en proceso
          </p>
        </div>
        <Link
          to="/contratos/nuevo"
          className="bg-inyecta-700 hover:bg-inyecta-800 text-white px-4 py-2 rounded-lg text-sm font-medium flex items-center gap-2 transition-colors"
        >
          <Plus size={16} /> Nuevo Contrato
        </Link>
      </div>

      {/* Pipeline bar */}
      <div className="bg-white rounded-xl border border-gray-200 p-4 mb-4">
        <div className="flex items-center gap-1 overflow-x-auto pb-1">
          {pipeline.map((stage, i) => {
            const colors = STAGE_COLORS[stage.stage];
            const Icon = STAGE_ICONS[stage.stage];
            const isActive = etapaFilter === stage.stage;
            return (
              <button
                key={stage.stage}
                onClick={() => {
                  setEtapaFilter(isActive ? '' : stage.stage);
                  setPage(1);
                }}
                className={`flex-1 min-w-[120px] flex flex-col items-center gap-1 px-3 py-3 rounded-lg border-2 transition-all ${
                  isActive
                    ? `${colors.bg} ${colors.border} ${colors.text}`
                    : 'border-transparent hover:bg-gray-50 text-gray-500'
                }`}
              >
                <div className="flex items-center gap-1.5">
                  {Icon && <Icon size={14} />}
                  <span className="text-xs font-medium whitespace-nowrap">{stage.label}</span>
                </div>
                <span className={`text-lg font-bold ${isActive ? colors.text : 'text-gray-900'}`}>
                  {stage.count}
                </span>
                {i < pipeline.length - 1 && (
                  <div className="absolute right-0 top-1/2 -translate-y-1/2 text-gray-300 hidden">→</div>
                )}
              </button>
            );
          })}
        </div>
        {etapaFilter && (
          <div className="mt-3 flex items-center gap-2">
            <Filter size={14} className="text-gray-400" />
            <span className="text-xs text-gray-500">
              Filtrando: <strong>{pipeline.find(p => p.stage === etapaFilter)?.label}</strong>
            </span>
            <button
              onClick={() => { setEtapaFilter(''); setPage(1); }}
              className="text-xs text-inyecta-600 hover:underline ml-1"
            >
              Limpiar filtro
            </button>
          </div>
        )}
      </div>

      {/* View toggle & search */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3 mb-4">
        <div className="flex-1 relative">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            type="text"
            placeholder="Buscar por folio, bien, cliente o RFC..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-9 pr-3 py-2 border border-gray-300 rounded-lg text-sm bg-white focus:ring-2 focus:ring-inyecta-500 focus:border-inyecta-500 outline-none"
          />
        </div>
        <div className="flex gap-1 bg-gray-100 p-0.5 rounded-lg">
          <button
            onClick={() => setViewMode('pipeline')}
            className={`px-3 py-1.5 rounded text-xs font-medium transition-colors ${
              viewMode === 'pipeline' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'
            }`}
          >
            Pipeline
          </button>
          <button
            onClick={() => setViewMode('list')}
            className={`px-3 py-1.5 rounded text-xs font-medium transition-colors ${
              viewMode === 'list' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'
            }`}
          >
            Lista
          </button>
        </div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-12">
          <div className="animate-spin rounded-full h-6 w-6 border-2 border-inyecta-600 border-t-transparent" />
        </div>
      ) : contracts.length === 0 && !etapaFilter ? (
        <div className="bg-white rounded-xl border border-gray-200 p-12 text-center">
          <FolderOpen className="mx-auto text-gray-300 mb-3" size={48} />
          <p className="text-gray-500 mb-2">No hay contratos registrados</p>
          <Link to="/contratos/nuevo" className="text-inyecta-600 hover:underline text-sm">
            Crear primer contrato
          </Link>
        </div>
      ) : viewMode === 'pipeline' ? (
        /* Pipeline View */
        <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-4">
          {pipeline.map((stage) => {
            const colors = STAGE_COLORS[stage.stage];
            const Icon = STAGE_ICONS[stage.stage];
            const stageContracts = contractsByStage[stage.stage] || [];
            if (etapaFilter && etapaFilter !== stage.stage) return null;
            return (
              <div key={stage.stage} className="bg-white rounded-xl border border-gray-200 overflow-hidden">
                {/* Stage header */}
                <div className={`flex items-center justify-between px-4 py-3 ${colors.bg} border-b ${colors.border}`}>
                  <div className="flex items-center gap-2">
                    <div className={`w-2 h-2 rounded-full ${colors.dot}`} />
                    {Icon && <Icon size={14} className={colors.text} />}
                    <span className={`text-sm font-semibold ${colors.text}`}>{stage.label}</span>
                  </div>
                  <span className={`text-xs font-bold ${colors.text} bg-white/60 px-2 py-0.5 rounded-full`}>
                    {stage.count}
                  </span>
                </div>
                {/* Cards */}
                <div className="p-2 space-y-2 max-h-[400px] overflow-y-auto">
                  {stageContracts.length === 0 ? (
                    <p className="text-xs text-gray-400 text-center py-6">Sin contratos</p>
                  ) : (
                    stageContracts.map((c) => (
                      <button
                        key={c.id}
                        onClick={() => navigate(`/contratos/${c.id}`)}
                        className="w-full text-left p-3 rounded-lg border border-gray-100 hover:border-inyecta-200 hover:bg-inyecta-50/30 transition-colors"
                      >
                        <div className="flex items-center justify-between mb-1">
                          <span className="font-mono text-xs text-inyecta-700 font-medium">{c.folio}</span>
                          <span className={`text-xs px-1.5 py-0.5 rounded ${
                            c.producto === 'PURO' ? 'bg-cyan-100 text-cyan-700' : 'bg-violet-100 text-violet-700'
                          }`}>
                            {c.producto === 'PURO' ? 'Puro' : 'Financiero'}
                          </span>
                        </div>
                        <p className="text-sm font-medium text-gray-900 truncate">{c.bienDescripcion}</p>
                        <div className="flex items-center gap-1 mt-1">
                          {c.client.tipo === 'PM' ? <Building2 size={10} className="text-gray-400" /> : <User size={10} className="text-gray-400" />}
                          <span className="text-xs text-gray-500 truncate">{clientDisplayName(c.client)}</span>
                        </div>
                        <div className="flex items-center justify-between mt-2 pt-2 border-t border-gray-50">
                          <span className="text-xs text-gray-400">{c.plazo}m · Riesgo {c.nivelRiesgo}</span>
                          <span className="text-xs font-semibold text-gray-700">{formatCurrency(Number(c.rentaMensualIVA))}/mes</span>
                        </div>
                      </button>
                    ))
                  )}
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        /* List View */
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm min-w-[900px]">
              <thead>
                <tr className="border-b border-gray-200 bg-gray-50">
                  <th className="px-4 py-3 text-left font-medium text-gray-500">Folio</th>
                  <th className="px-4 py-3 text-left font-medium text-gray-500">Cliente</th>
                  <th className="px-4 py-3 text-left font-medium text-gray-500">Bien</th>
                  <th className="px-4 py-3 text-center font-medium text-gray-500">Producto</th>
                  <th className="px-4 py-3 text-center font-medium text-gray-500">Etapa</th>
                  <th className="px-4 py-3 text-right font-medium text-gray-500">Renta + IVA</th>
                  <th className="px-4 py-3 text-right font-medium text-gray-500">Monto</th>
                  <th className="px-4 py-3 text-left font-medium text-gray-500">Fecha</th>
                  <th className="px-4 py-3"></th>
                </tr>
              </thead>
              <tbody>
                {filteredContracts.map((c) => {
                  const colors = STAGE_COLORS[c.etapa] || STAGE_COLORS.SOLICITUD;
                  return (
                    <tr key={c.id} className="border-b border-gray-100 hover:bg-gray-50">
                      <td className="px-4 py-3">
                        <span className="font-mono text-xs text-inyecta-700 font-medium">{c.folio}</span>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-1.5">
                          {c.client.tipo === 'PM' ? <Building2 size={12} className="text-gray-400" /> : <User size={12} className="text-gray-400" />}
                          <span className="text-gray-900 font-medium truncate max-w-[180px]">{clientDisplayName(c.client)}</span>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-gray-600 truncate max-w-[200px]">{c.bienDescripcion}</td>
                      <td className="px-4 py-3 text-center">
                        <span className={`text-xs px-2 py-0.5 rounded ${
                          c.producto === 'PURO' ? 'bg-cyan-100 text-cyan-700' : 'bg-violet-100 text-violet-700'
                        }`}>
                          {c.producto === 'PURO' ? 'Puro' : 'Financiero'}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-center">
                        <span className={`text-xs font-medium px-2 py-0.5 rounded ${colors.bg} ${colors.text}`}>
                          {pipeline.find(p => p.stage === c.etapa)?.label || c.etapa}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-right font-medium text-gray-900">{formatCurrency(Number(c.rentaMensualIVA))}</td>
                      <td className="px-4 py-3 text-right text-gray-600">{formatCurrency(Number(c.montoFinanciar))}</td>
                      <td className="px-4 py-3 text-gray-500 text-xs">{formatDate(c.createdAt)}</td>
                      <td className="px-4 py-3">
                        <Link to={`/contratos/${c.id}`} className="text-inyecta-600 hover:text-inyecta-800">
                          <Eye size={16} />
                        </Link>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          {pages > 1 && (
            <div className="flex items-center justify-between px-4 py-3 border-t border-gray-200">
              <p className="text-sm text-gray-500">Pagina {page} de {pages}</p>
              <div className="flex gap-2">
                <button onClick={() => setPage(Math.max(1, page - 1))} disabled={page === 1} className="p-1 rounded hover:bg-gray-100 disabled:opacity-50">
                  <ChevronLeft size={16} />
                </button>
                <button onClick={() => setPage(Math.min(pages, page + 1))} disabled={page === pages} className="p-1 rounded hover:bg-gray-100 disabled:opacity-50">
                  <ChevronRight size={16} />
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
