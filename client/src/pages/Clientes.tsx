import { useState, useEffect, useCallback } from 'react';
import { Link } from 'react-router-dom';
import api from '@/lib/api';
import { formatDate } from '@/lib/utils';
import LoadErrorState, { describeApiError } from '@/components/LoadErrorState';
import { Users, Search, Plus, Eye, ChevronLeft, ChevronRight, Building2, User } from 'lucide-react';

interface ClientRow {
  id: string;
  tipo: 'PFAE' | 'PM';
  nombre?: string;
  apellidoPaterno?: string;
  apellidoMaterno?: string;
  razonSocial?: string;
  rfc?: string;
  email?: string;
  telefono?: string;
  ciudad?: string;
  estado?: string;
  createdAt: string;
  docProgress: { total: number; recibidos: number; requeridosTotal: number; requeridosRecibidos: number };
  _count: { cotizaciones: number; contratos: number };
}

function clientDisplayName(c: ClientRow): string {
  if (c.tipo === 'PM') return c.razonSocial || 'Sin nombre';
  return [c.nombre, c.apellidoPaterno, c.apellidoMaterno].filter(Boolean).join(' ') || 'Sin nombre';
}

export default function Clientes() {
  const [clients, setClients] = useState<ClientRow[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pages, setPages] = useState(1);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [tipoFilter, setTipoFilter] = useState<string>('');

  const fetchClients = useCallback(() => {
    setLoading(true);
    setLoadError(null);
    const params = new URLSearchParams({ page: String(page), limit: '20' });
    if (search) params.set('search', search);
    if (tipoFilter) params.set('tipo', tipoFilter);

    api.get(`/clients?${params}`)
      .then((res) => {
        setClients(res.data.data);
        setTotal(res.data.total);
        setPages(res.data.pages);
      })
      .catch((err) => setLoadError(describeApiError(err)))
      .finally(() => setLoading(false));
  }, [page, search, tipoFilter]);

  useEffect(() => {
    fetchClients();
  }, [fetchClients]);

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    setPage(1);
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Clientes</h1>
          <p className="text-gray-500 text-sm mt-1">{total} clientes registrados</p>
        </div>
        <Link
          to="/clientes/nuevo"
          className="bg-inyecta-700 hover:bg-inyecta-800 text-white px-4 py-2 rounded-lg text-sm font-medium flex items-center gap-2 transition-colors"
        >
          <Plus size={16} /> Nuevo Cliente
        </Link>
      </div>

      {/* Search & filters */}
      <div className="bg-white rounded-xl border border-gray-200 p-4 mb-4">
        <div className="flex flex-col sm:flex-row gap-3">
          <form onSubmit={handleSearch} className="flex-1 relative">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input
              type="text"
              placeholder="Buscar por nombre, RFC o email..."
              value={search}
              onChange={(e) => { setSearch(e.target.value); setPage(1); }}
              className="w-full pl-9 pr-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-inyecta-500 focus:border-inyecta-500 outline-none"
            />
          </form>
          <div className="flex gap-2">
            {['', 'PFAE', 'PM'].map((t) => (
              <button
                key={t}
                onClick={() => { setTipoFilter(t); setPage(1); }}
                className={`px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                  tipoFilter === t
                    ? 'bg-inyecta-700 text-white'
                    : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                }`}
              >
                {t === '' ? 'Todos' : t}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Table */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        {loading ? (
          <div className="flex items-center justify-center py-12">
            <div className="animate-spin rounded-full h-6 w-6 border-2 border-inyecta-600 border-t-transparent" />
          </div>
        ) : loadError ? (
          <LoadErrorState
            title="No se pudo cargar la lista de clientes"
            error={loadError}
            onRetry={fetchClients}
          />
        ) : clients.length === 0 ? (
          <div className="text-center py-12">
            <Users className="mx-auto text-gray-300 mb-3" size={40} />
            <p className="text-gray-500">{search ? 'No se encontraron clientes' : 'No hay clientes registrados'}</p>
            {!search && (
              <Link to="/clientes/nuevo" className="text-inyecta-600 hover:underline text-sm mt-2 inline-block">
                Registrar primer cliente
              </Link>
            )}
          </div>
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full text-sm min-w-[800px]">
                <thead>
                  <tr className="border-b border-gray-200 bg-gray-50">
                    <th className="px-4 py-3 text-left font-medium text-gray-500">Tipo</th>
                    <th className="px-4 py-3 text-left font-medium text-gray-500">Nombre / Razon Social</th>
                    <th className="px-4 py-3 text-left font-medium text-gray-500">RFC</th>
                    <th className="px-4 py-3 text-left font-medium text-gray-500">Contacto</th>
                    <th className="px-4 py-3 text-center font-medium text-gray-500">Documentos</th>
                    <th className="px-4 py-3 text-center font-medium text-gray-500">Operaciones</th>
                    <th className="px-4 py-3 text-left font-medium text-gray-500">Registro</th>
                    <th className="px-4 py-3"></th>
                  </tr>
                </thead>
                <tbody>
                  {clients.map((c) => {
                    const pct = c.docProgress.requeridosTotal > 0
                      ? Math.round((c.docProgress.requeridosRecibidos / c.docProgress.requeridosTotal) * 100)
                      : 0;
                    return (
                      <tr key={c.id} className="border-b border-gray-100 hover:bg-gray-50">
                        <td className="px-4 py-3">
                          <span className={`inline-flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded ${
                            c.tipo === 'PM' ? 'bg-blue-100 text-blue-700' : 'bg-emerald-100 text-emerald-700'
                          }`}>
                            {c.tipo === 'PM' ? <Building2 size={12} /> : <User size={12} />}
                            {c.tipo}
                          </span>
                        </td>
                        <td className="px-4 py-3 font-medium text-gray-900">{clientDisplayName(c)}</td>
                        <td className="px-4 py-3 font-mono text-xs text-gray-600">{c.rfc || '-'}</td>
                        <td className="px-4 py-3">
                          <div className="text-gray-700 text-xs">{c.email || '-'}</div>
                          <div className="text-gray-400 text-xs">{c.telefono || ''}</div>
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex items-center justify-center gap-2">
                            <div className="w-16 h-1.5 bg-gray-200 rounded-full overflow-hidden">
                              <div
                                className={`h-full rounded-full ${pct === 100 ? 'bg-emerald-500' : pct > 50 ? 'bg-amber-500' : 'bg-red-400'}`}
                                style={{ width: `${pct}%` }}
                              />
                            </div>
                            <span className="text-xs text-gray-500">{pct}%</span>
                          </div>
                        </td>
                        <td className="px-4 py-3 text-center">
                          <span className="text-xs text-gray-500">
                            {c._count.cotizaciones}C / {c._count.contratos}K
                          </span>
                        </td>
                        <td className="px-4 py-3 text-gray-500 text-xs">{formatDate(c.createdAt)}</td>
                        <td className="px-4 py-3">
                          <Link to={`/clientes/${c.id}`} className="text-inyecta-600 hover:text-inyecta-800">
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
          </>
        )}
      </div>
    </div>
  );
}
