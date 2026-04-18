import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import api from '@/lib/api';
import { formatCurrency, formatDate } from '@/lib/utils';
import { FileText, Eye, ChevronLeft, ChevronRight } from 'lucide-react';

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
  user?: { nombre: string; apellidos: string };
}

const estadoColors: Record<string, string> = {
  BORRADOR: 'bg-gray-100 text-gray-700',
  ENVIADA: 'bg-blue-100 text-blue-700',
  APROBADA: 'bg-green-100 text-green-700',
  RECHAZADA: 'bg-red-100 text-red-700',
  VENCIDA: 'bg-amber-100 text-amber-700',
};

export default function Cotizaciones() {
  const [quotations, setQuotations] = useState<Quotation[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pages, setPages] = useState(1);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    api.get(`/quotations?page=${page}&limit=20`)
      .then((res) => {
        setQuotations(res.data.data);
        setTotal(res.data.total);
        setPages(res.data.pages);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [page]);

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

      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        {loading ? (
          <div className="flex items-center justify-center py-12">
            <div className="animate-spin rounded-full h-6 w-6 border-2 border-inyecta-600 border-t-transparent" />
          </div>
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
                        <span className="text-xs font-medium bg-inyecta-100 text-inyecta-700 px-2 py-0.5 rounded">
                          {q.nivelRiesgo}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-center">
                        <span className={`text-xs font-medium px-2 py-0.5 rounded ${estadoColors[q.estado] || 'bg-gray-100 text-gray-600'}`}>
                          {q.estado}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-gray-500 text-xs">{formatDate(q.createdAt)}</td>
                      <td className="px-4 py-3">
                        <Link to={`/cotizaciones/${q.id}`} className="text-inyecta-600 hover:text-inyecta-800">
                          <Eye size={16} />
                        </Link>
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
