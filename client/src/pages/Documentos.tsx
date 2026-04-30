/**
 * /documentos — Dashboard agregado de documentación cross-contratos.
 *
 * Vista de SÓLO LECTURA: muestra todos los clientes activos con su %
 * de cumplimiento documental sumando todos sus contratos. La edición
 * de cada documento sigue viviendo en /contratos/:id → tab Documentos
 * (que es donde Damián diseñó el flujo de captura).
 *
 * Reemplazo total de la versión legacy que llamaba a /api/documents
 * (modelo viejo ClientDocument). Ahora consume /api/documents/dashboard
 * que agrega ExpedienteDocumento por contrato → totalizado por cliente.
 *
 * Damián 30-04-2026 — opción 2 del plan R5.
 */
import { useState, useEffect, useCallback, Fragment } from 'react';
import { Link } from 'react-router-dom';
import api from '@/lib/api';
import LoadErrorState, { describeApiError } from '@/components/LoadErrorState';
import {
  FolderOpen, Search, CheckCircle2, AlertTriangle, XCircle, Building2,
  User, ChevronDown, ChevronRight, Eye, Briefcase,
} from 'lucide-react';

// ─── Types ──────────────────────────────────────────────────────────

interface ContratoLite {
  id: string;
  folio: string;
  etapa: string;
  estatus: string;
  producto: 'PURO' | 'FINANCIERO';
  docCount: number;
}

interface ClienteRow {
  id: string;
  tipo: 'PFAE' | 'PM';
  nombre: string;
  rfc: string | null;
  email: string | null;
  totalContratos: number;
  contratos: ContratoLite[];
  documentos: {
    validados: number;
    pendientes: number;
    rechazados: number;
    total: number;
    porcentajeValidado: number;
    alerta: 'rechazado' | 'pendiente' | 'sin_contratos' | null;
    completo: boolean;
  };
}

interface DashboardResponse {
  clientes: ClienteRow[];
  totales: {
    todos: number;
    conAlertas: number;
    incompletos: number;
    completos: number;
  };
}

type Filtro = 'todos' | 'con_alertas' | 'incompletos' | 'completos';

// ─── Helpers ────────────────────────────────────────────────────────

const FILTROS: { key: Filtro; label: string }[] = [
  { key: 'todos',       label: 'Todos' },
  { key: 'con_alertas', label: 'Con Alertas' },
  { key: 'incompletos', label: 'Incompletos' },
  { key: 'completos',   label: 'Completos' },
];

function alertaLabel(a: ClienteRow['documentos']['alerta']) {
  if (a === 'rechazado')      return { texto: 'Rechazado',      color: 'bg-red-100 text-red-700',     icon: XCircle };
  if (a === 'pendiente')      return { texto: 'Pendiente',      color: 'bg-amber-100 text-amber-700', icon: AlertTriangle };
  if (a === 'sin_contratos')  return { texto: 'Sin operaciones', color: 'bg-gray-100 text-gray-500',  icon: Briefcase };
  return null;
}

function progressColor(pct: number): string {
  if (pct === 100) return 'bg-emerald-500';
  if (pct >= 70)   return 'bg-amber-500';
  if (pct >= 30)   return 'bg-orange-500';
  return 'bg-red-400';
}

// ─── Component ──────────────────────────────────────────────────────

export default function Documentos() {
  const [data, setData] = useState<DashboardResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [filtro, setFiltro] = useState<Filtro>('todos');
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const fetchDashboard = useCallback(() => {
    setLoading(true);
    setLoadError(null);
    const params = new URLSearchParams({ filtro });
    if (search.trim()) params.set('search', search.trim());
    api.get<DashboardResponse>(`/documents/dashboard?${params}`)
      .then((r) => setData(r.data))
      .catch((err) => setLoadError(describeApiError(err)))
      .finally(() => setLoading(false));
  }, [filtro, search]);

  useEffect(() => {
    // Debounce 300ms en search para no martillar el server al teclear
    const t = setTimeout(fetchDashboard, search ? 300 : 0);
    return () => clearTimeout(t);
  }, [fetchDashboard, search]);

  const totales = data?.totales || { todos: 0, conAlertas: 0, incompletos: 0, completos: 0 };

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
          <FolderOpen size={24} className="text-inyecta-600" />
          Administrador de Documentos
        </h1>
        <p className="text-gray-500 text-sm mt-1">
          Cumplimiento documental por arrendatario · Agregado de todas sus operaciones.
          Para editar documentos individuales entra al detalle del contrato.
        </p>
      </div>

      {/* Búsqueda + filtros */}
      <div className="bg-white rounded-xl border border-gray-200 p-4 mb-4">
        <div className="flex flex-col sm:flex-row gap-3 mb-3">
          <div className="flex-1 relative">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input
              type="text"
              placeholder="Buscar cliente o RFC..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-9 pr-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-inyecta-500 focus:border-inyecta-500 outline-none"
            />
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          {FILTROS.map((f) => {
            const count =
              f.key === 'todos'         ? totales.todos
              : f.key === 'con_alertas' ? totales.conAlertas
              : f.key === 'incompletos' ? totales.incompletos
              : totales.completos;
            return (
              <button
                key={f.key}
                onClick={() => setFiltro(f.key)}
                className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors flex items-center gap-2 ${
                  filtro === f.key
                    ? 'bg-inyecta-700 text-white'
                    : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                }`}
              >
                {f.label}
                <span className={`text-xs px-1.5 py-0.5 rounded-full ${
                  filtro === f.key ? 'bg-inyecta-900/30 text-white' : 'bg-white text-gray-500'
                }`}>
                  {count}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Tabla */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        {loading ? (
          <div className="flex items-center justify-center py-12">
            <div className="animate-spin rounded-full h-6 w-6 border-2 border-inyecta-600 border-t-transparent" />
          </div>
        ) : loadError ? (
          <LoadErrorState
            title="No se pudo cargar el dashboard de documentos"
            error={loadError}
            onRetry={fetchDashboard}
          />
        ) : !data || data.clientes.length === 0 ? (
          <div className="text-center py-12">
            <FolderOpen className="mx-auto text-gray-300 mb-3" size={40} />
            <p className="text-gray-500">
              {search ? 'No se encontraron clientes' : 'No hay clientes con este filtro'}
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm min-w-[900px]">
              <thead>
                <tr className="border-b border-gray-200 bg-gray-50 text-xs text-gray-500">
                  <th className="px-3 py-3 text-left w-8"></th>
                  <th className="px-3 py-3 text-left">Cliente</th>
                  <th className="px-3 py-3 text-left">RFC</th>
                  <th className="px-3 py-3 text-center">Operaciones</th>
                  <th className="px-3 py-3 text-left w-64">Documentos</th>
                  <th className="px-3 py-3 text-center">Estado</th>
                  <th className="px-3 py-3"></th>
                </tr>
              </thead>
              <tbody>
                {data.clientes.map((c) => {
                  const isExpanded = expandedId === c.id;
                  const Alerta = alertaLabel(c.documentos.alerta);
                  return (
                    <Fragment key={c.id}>
                      <tr className={`border-b border-gray-100 transition-colors ${
                        isExpanded ? 'bg-inyecta-50/50' : 'hover:bg-gray-50'
                      }`}>
                        <td className="px-3 py-3">
                          <button
                            onClick={() => setExpandedId(isExpanded ? null : c.id)}
                            className="text-gray-400 hover:text-gray-600 disabled:opacity-30"
                            disabled={c.contratos.length === 0}
                            title={c.contratos.length === 0 ? 'Sin operaciones' : 'Ver operaciones'}
                          >
                            {isExpanded ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
                          </button>
                        </td>
                        <td className="px-3 py-3">
                          <div className="flex items-center gap-2">
                            <span className={`p-1 rounded ${
                              c.tipo === 'PM' ? 'bg-blue-100 text-blue-700' : 'bg-emerald-100 text-emerald-700'
                            }`}>
                              {c.tipo === 'PM' ? <Building2 size={12} /> : <User size={12} />}
                            </span>
                            <Link
                              to={`/clientes/${c.id}`}
                              className="font-medium text-gray-900 hover:text-inyecta-700"
                            >
                              {c.nombre}
                            </Link>
                          </div>
                          {c.email && (
                            <div className="text-xs text-gray-400 mt-0.5 ml-7">{c.email}</div>
                          )}
                        </td>
                        <td className="px-3 py-3 font-mono text-xs text-gray-600">{c.rfc || '—'}</td>
                        <td className="px-3 py-3 text-center text-gray-700">{c.totalContratos}</td>
                        <td className="px-3 py-3">
                          <div className="flex items-center gap-2">
                            <div className="w-32 h-2 bg-gray-200 rounded-full overflow-hidden flex-shrink-0">
                              <div
                                className={`h-full ${progressColor(c.documentos.porcentajeValidado)} transition-all`}
                                style={{ width: `${c.documentos.porcentajeValidado}%` }}
                              />
                            </div>
                            <span className="text-xs text-gray-600 whitespace-nowrap">
                              {c.documentos.porcentajeValidado}%
                            </span>
                          </div>
                          <div className="text-xs text-gray-400 mt-1">
                            {c.documentos.validados}/{c.documentos.total} validados
                            {c.documentos.pendientes > 0 && ` · ${c.documentos.pendientes} pendientes`}
                            {c.documentos.rechazados > 0 && ` · ${c.documentos.rechazados} rechazados`}
                          </div>
                        </td>
                        <td className="px-3 py-3 text-center">
                          {c.documentos.completo ? (
                            <span className="inline-flex items-center gap-1 text-xs px-2 py-1 rounded bg-emerald-100 text-emerald-700">
                              <CheckCircle2 size={12} /> Completo
                            </span>
                          ) : Alerta ? (
                            <span className={`inline-flex items-center gap-1 text-xs px-2 py-1 rounded ${Alerta.color}`}>
                              <Alerta.icon size={12} /> {Alerta.texto}
                            </span>
                          ) : (
                            <span className="text-xs text-gray-400">—</span>
                          )}
                        </td>
                        <td className="px-3 py-3">
                          <Link
                            to={`/clientes/${c.id}`}
                            className="text-inyecta-600 hover:text-inyecta-800 inline-flex items-center"
                            title="Ver cliente"
                          >
                            <Eye size={16} />
                          </Link>
                        </td>
                      </tr>

                      {isExpanded && c.contratos.length > 0 && (
                        <tr className="bg-gray-50/50 border-b border-gray-200">
                          <td></td>
                          <td colSpan={6} className="px-3 py-3">
                            <p className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-2">
                              Operaciones del cliente · click para editar documentos
                            </p>
                            <div className="space-y-1.5">
                              {c.contratos.map((k) => (
                                <Link
                                  key={k.id}
                                  to={`/contratos/${k.id}`}
                                  className="flex items-center gap-3 px-3 py-2 bg-white border border-gray-200 rounded hover:border-inyecta-400 hover:shadow-sm transition-all"
                                >
                                  <span className="font-mono text-xs text-gray-500">{k.folio}</span>
                                  <span className={`text-xs px-1.5 py-0.5 rounded ${
                                    k.producto === 'PURO' ? 'bg-blue-100 text-blue-700' : 'bg-purple-100 text-purple-700'
                                  }`}>
                                    {k.producto}
                                  </span>
                                  <span className="text-xs text-gray-500">{k.etapa}</span>
                                  <span className="text-xs text-gray-400">·</span>
                                  <span className="text-xs text-gray-600">
                                    {k.docCount} {k.docCount === 1 ? 'documento' : 'documentos'}
                                  </span>
                                  <span className="ml-auto text-xs text-inyecta-600 hover:underline">
                                    Editar expediente →
                                  </span>
                                </Link>
                              ))}
                            </div>
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
