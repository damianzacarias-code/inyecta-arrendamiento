import { useState, useEffect, useCallback } from 'react';
import { Link } from 'react-router-dom';
import api from '@/lib/api';
import { formatCurrency, formatDate } from '@/lib/utils';
import LoadErrorState, { describeApiError } from '@/components/LoadErrorState';
import { FileText, Eye, ChevronLeft, ChevronRight, FolderOpen } from 'lucide-react';
import { riskLabel, riskBadgeClasses } from '@/lib/cotizacion/riesgoLabels';

interface Quotation {
  id: string;
  folio: string;
  nombreCliente: string;
  producto: string;
  valorBien: number;
  rentaMensualIVA: number;
  plazo: number;
  nivelRiesgo: string;
  estado: string;
  createdAt: string;
  vigenciaHasta?: string;
  user?: { nombre: string; apellidos: string };
  contrato?: { id: string; folio: string } | null;
}

const ESTADOS = ['VIGENTE', 'APROBADA', 'CONVERTIDA', 'VENCIDA', 'RECHAZADA'] as const;
type Estado = typeof ESTADOS[number] | '';

const estadoColors: Record<string, string> = {
  VIGENTE: 'bg-emerald-100 text-emerald-700 border-emerald-200',
  APROBADA: 'bg-blue-100 text-blue-700 border-blue-200',
  CONVERTIDA: 'bg-violet-100 text-violet-700 border-violet-200',
  VENCIDA: 'bg-amber-100 text-amber-700 border-amber-200',
  RECHAZADA: 'bg-red-100 text-red-700 border-red-200',
};

const estadoLabels: Record<string, string> = {
  VIGENTE: 'Vigente',
  APROBADA: 'Aprobada',
  CONVERTIDA: 'Convertida',
  VENCIDA: 'Vencida',
  RECHAZADA: 'Rechazada',
};

export default function Cotizaciones() {
  const [quotations, setQuotations] = useState<Quotation[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pages, setPages] = useState(1);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [filterEstado, setFilterEstado] = useState<Estado>('');

  const fetchQuotations = useCallback(() => {
    setLoading(true);
    setLoadError(null);
    const params = new URLSearchParams({ page: String(page), limit: '20' });
    if (filterEstado) params.set('estado', filterEstado);
    api.get(`/quotations?${params.toString()}`)
      .then((res) => {
        setQuotations(res.data.data);
        setTotal(res.data.total);
        setPages(res.data.pages);
      })
      .catch((err) => setLoadError(describeApiError(err)))
      .finally(() => setLoading(false));
  }, [page, filterEstado]);

  useEffect(() => {
    fetchQuotations();
  }, [fetchQuotations]);

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Cotizaciones</h1>
          <p className="text-gray-500 text-sm mt-1">{total} cotizaciones en total</p>
        </div>
        <Link
          to="/cotizador"
          className="bg-inyecta-700 hover:bg-inyecta-800 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors"
        >
          + Nueva Cotizacion
        </Link>
      </div>

      {/* Filtro por estado */}
      <div className="flex flex-wrap gap-2 mb-4">
        <button
          onClick={() => { setFilterEstado(''); setPage(1); }}
          className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors ${
            filterEstado === ''
              ? 'bg-inyecta-700 text-white border-inyecta-700'
              : 'bg-white text-gray-600 border-gray-200 hover:border-gray-300'
          }`}
        >
          Todas
        </button>
        {ESTADOS.map((e) => (
          <button
            key={e}
            onClick={() => { setFilterEstado(e); setPage(1); }}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors ${
              filterEstado === e
                ? estadoColors[e]
                : 'bg-white text-gray-500 border-gray-200 hover:border-gray-300'
            }`}
          >
            {estadoLabels[e]}
          </button>
        ))}
      </div>

      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        {loading ? (
          <div className="flex items-center justify-center py-12">
            <div className="animate-spin rounded-full h-6 w-6 border-2 border-inyecta-600 border-t-transparent" />
          </div>
        ) : loadError ? (
          <LoadErrorState
            title="No se pudo cargar la lista de cotizaciones"
            error={loadError}
            onRetry={fetchQuotations}
          />
        ) : quotations.length === 0 ? (
          <div className="text-center py-12">
            <FileText className="mx-auto text-gray-300 mb-3" size={40} />
            <p className="text-gray-500">No hay cotizaciones</p>
          </div>
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full text-sm min-w-[900px]">
                <thead>
                  <tr className="border-b border-gray-200 bg-gray-50">
                    <th className="px-4 py-3 text-left font-medium text-gray-500">Folio</th>
                    <th className="px-4 py-3 text-left font-medium text-gray-500">Cliente</th>
                    <th className="px-4 py-3 text-left font-medium text-gray-500">Producto</th>
                    <th className="px-4 py-3 text-right font-medium text-gray-500">Valor Bien</th>
                    <th className="px-4 py-3 text-right font-medium text-gray-500">Renta</th>
                    <th className="px-4 py-3 text-center font-medium text-gray-500">Plazo</th>
                    <th className="px-4 py-3 text-center font-medium text-gray-500">Riesgo</th>
                    <th className="px-4 py-3 text-center font-medium text-gray-500">Estado</th>
                    <th className="px-4 py-3 text-left font-medium text-gray-500">Fecha</th>
                    <th className="px-4 py-3"></th>
                  </tr>
                </thead>
                <tbody>
                  {quotations.map((q) => (
                    <tr key={q.id} className="border-b border-gray-100 hover:bg-gray-50">
                      <td className="px-4 py-3 font-mono text-xs text-inyecta-700">{q.folio}</td>
                      <td className="px-4 py-3 font-medium text-gray-900">{q.nombreCliente}</td>
                      <td className="px-4 py-3 text-gray-600">{q.producto}</td>
                      <td className="px-4 py-3 text-right text-gray-700">{formatCurrency(Number(q.valorBien))}</td>
                      <td className="px-4 py-3 text-right font-medium text-gray-900">{formatCurrency(Number(q.rentaMensualIVA))}</td>
                      <td className="px-4 py-3 text-center text-gray-600">{q.plazo}m</td>
                      <td className="px-4 py-3 text-center">
                        <span className={`text-xs font-medium px-2 py-0.5 rounded ${riskBadgeClasses(q.nivelRiesgo)}`}>
                          {riskLabel(q.nivelRiesgo)}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-center">
                        <span className={`text-xs font-medium px-2 py-0.5 rounded border ${estadoColors[q.estado] || 'bg-gray-100 text-gray-600 border-gray-200'}`}>
                          {estadoLabels[q.estado] || q.estado}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-gray-500 text-xs">{formatDate(q.createdAt)}</td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2 justify-end">
                          {q.contrato && (
                            <Link
                              to={`/contratos/${q.contrato.id}`}
                              title={`Ver contrato ${q.contrato.folio}`}
                              className="text-violet-600 hover:text-violet-800"
                            >
                              <FolderOpen size={16} />
                            </Link>
                          )}
                          <Link to={`/cotizaciones/${q.id}`} className="text-inyecta-600 hover:text-inyecta-800">
                            <Eye size={16} />
                          </Link>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {pages > 1 && (
              <div className="flex items-center justify-between px-4 py-3 border-t border-gray-200">
                <p className="text-sm text-gray-500">
                  Pagina {page} de {pages}
                </p>
                <div className="flex gap-2">
                  <button
                    onClick={() => setPage(Math.max(1, page - 1))}
                    disabled={page === 1}
                    className="p-1 rounded hover:bg-gray-100 disabled:opacity-50"
                  >
                    <ChevronLeft size={16} />
                  </button>
                  <button
                    onClick={() => setPage(Math.min(pages, page + 1))}
                    disabled={page === pages}
                    className="p-1 rounded hover:bg-gray-100 disabled:opacity-50"
                  >
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
