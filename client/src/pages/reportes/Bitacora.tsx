/**
 * Bitácora — Visor de auditoría (PLD)
 * ---------------------------------------------------------------
 * Consume GET /api/bitacora (T7 backend, restringido a ADMIN/DIRECTOR).
 * Tabla paginada con filtros por usuario (q), entidad, acción, rango
 * de fechas. Click en fila abre un panel lateral con el payload JSON
 * sanitizado y el detalle del evento.
 *
 * El endpoint ya valida el rol del lado del servidor; aquí simplemente
 * mostramos un mensaje amigable si el usuario no es ADMIN/DIRECTOR.
 */
import { useEffect, useMemo, useState, useCallback } from 'react';
import api from '@/lib/api';
import { useAuth } from '@/context/AuthContext';
import {
  ScrollText,
  Filter,
  ChevronLeft,
  ChevronRight,
  X,
  Search,
  RotateCcw,
  Shield,
} from 'lucide-react';

interface BitacoraEvent {
  id: string;
  usuarioId: string | null;
  usuarioEmail: string | null;
  usuarioRol: string | null;
  metodo: string;
  ruta: string;
  entidad: string | null;
  entidadId: string | null;
  accion: string;
  payloadJson: unknown;
  responseStatus: number | null;
  ip: string | null;
  userAgent: string | null;
  createdAt: string;
}

interface BitacoraResponse {
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
  items: BitacoraEvent[];
}

const ENTIDADES = [
  '',
  'Contract',
  'Client',
  'Quotation',
  'Payment',
  'Invoice',
  'Notificacion',
  'User',
  'GpsConfig',
  'Insurance',
  'Document',
  'Bitacora',
];

const ACCIONES = ['', 'CREATE', 'UPDATE', 'DELETE', 'LOGIN', 'LOGOUT', 'PATCH', 'GET'];

const METODO_STYLE: Record<string, { color: string; bg: string }> = {
  GET:    { color: 'text-gray-700',    bg: 'bg-gray-100' },
  POST:   { color: 'text-emerald-700', bg: 'bg-emerald-100' },
  PUT:    { color: 'text-amber-700',   bg: 'bg-amber-100' },
  PATCH:  { color: 'text-amber-700',   bg: 'bg-amber-100' },
  DELETE: { color: 'text-red-700',     bg: 'bg-red-100' },
};

function statusColor(s: number | null): string {
  if (s == null) return 'text-gray-400';
  if (s >= 500) return 'text-red-700';
  if (s >= 400) return 'text-amber-700';
  if (s >= 300) return 'text-blue-700';
  return 'text-emerald-700';
}

function fmtDate(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleString('es-MX', {
    day:   '2-digit',
    month: '2-digit',
    year:  'numeric',
    hour:  '2-digit',
    minute:'2-digit',
    second:'2-digit',
  });
}

export default function ReportesBitacora() {
  const { user } = useAuth();
  const allowed = user?.rol === 'ADMIN' || user?.rol === 'DIRECTOR';

  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(50);
  const [q, setQ] = useState('');
  const [entidad, setEntidad] = useState('');
  const [accion, setAccion] = useState('');
  const [desde, setDesde] = useState('');
  const [hasta, setHasta] = useState('');

  const [data, setData] = useState<BitacoraResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [seleccionado, setSeleccionado] = useState<BitacoraEvent | null>(null);

  const load = useCallback(async () => {
    if (!allowed) return;
    setLoading(true);
    setError('');
    try {
      const params: Record<string, string | number> = { page, pageSize };
      if (q) params.q = q;
      if (entidad) params.entidad = entidad;
      if (accion) params.accion = accion;
      if (desde) params.desde = new Date(desde).toISOString();
      if (hasta) params.hasta = new Date(hasta + 'T23:59:59').toISOString();
      const res = await api.get<BitacoraResponse>('/bitacora', { params });
      setData(res.data);
    } catch (e) {
      const err = e as { response?: { data?: { error?: string } } };
      setError(err.response?.data?.error || 'Error cargando bitácora');
    } finally {
      setLoading(false);
    }
  }, [allowed, page, pageSize, q, entidad, accion, desde, hasta]);

  // Refresca en cambios de paginación / filtros con debounce ligero para `q`
  useEffect(() => {
    const t = window.setTimeout(load, 250);
    return () => window.clearTimeout(t);
  }, [load]);

  const limpiarFiltros = () => {
    setQ('');
    setEntidad('');
    setAccion('');
    setDesde('');
    setHasta('');
    setPage(1);
  };

  const filtrosActivos = useMemo(
    () => Number(Boolean(q)) + Number(Boolean(entidad)) + Number(Boolean(accion)) + Number(Boolean(desde)) + Number(Boolean(hasta)),
    [q, entidad, accion, desde, hasta],
  );

  if (!allowed) {
    return (
      <div className="max-w-2xl mx-auto mt-12">
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-6 flex items-start gap-3">
          <Shield className="text-amber-600 shrink-0" size={20} />
          <div>
            <h2 className="font-semibold text-amber-900">Acceso restringido</h2>
            <p className="text-sm text-amber-800 mt-1">
              La bitácora de auditoría sólo es visible para usuarios con rol ADMIN o DIRECTOR.
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-inyecta-100 flex items-center justify-center">
            <ScrollText className="text-inyecta-700" size={20} />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Bitácora de Auditoría</h1>
            <p className="text-gray-500 text-sm mt-0.5">
              Registro inmutable de todas las acciones del sistema (PLD)
            </p>
          </div>
        </div>
        {data && (
          <div className="text-xs text-gray-500">
            {data.total.toLocaleString('es-MX')} eventos registrados
          </div>
        )}
      </div>

      {/* Filtros */}
      <div className="bg-white rounded-xl border border-gray-200 p-4 mb-4">
        <div className="flex items-center gap-2 mb-3">
          <Filter size={14} className="text-gray-400" />
          <span className="text-sm font-medium text-gray-700">Filtros</span>
          {filtrosActivos > 0 && (
            <>
              <span className="text-xs bg-inyecta-100 text-inyecta-700 px-2 py-0.5 rounded font-medium">
                {filtrosActivos} activos
              </span>
              <button
                onClick={limpiarFiltros}
                className="text-xs text-gray-400 hover:text-red-600 flex items-center gap-1 ml-auto"
              >
                <RotateCcw size={11} /> Limpiar
              </button>
            </>
          )}
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-3">
          <div className="lg:col-span-2">
            <label className="block text-xs text-gray-500 mb-1">Buscar (ruta o email)</label>
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400" size={13} />
              <input
                type="text"
                value={q}
                onChange={e => { setQ(e.target.value); setPage(1); }}
                placeholder="usuario@correo.com  ó  /api/contracts"
                className="w-full pl-8 pr-3 py-1.5 border border-gray-300 rounded text-sm focus:ring-2 focus:ring-inyecta-500 focus:border-inyecta-500 outline-none"
              />
            </div>
          </div>
          <div>
            <label className="block text-xs text-gray-500 mb-1">Entidad</label>
            <select
              value={entidad}
              onChange={e => { setEntidad(e.target.value); setPage(1); }}
              className="w-full px-2 py-1.5 border border-gray-300 rounded text-sm focus:ring-2 focus:ring-inyecta-500 focus:border-inyecta-500 outline-none"
            >
              {ENTIDADES.map(e => (
                <option key={e} value={e}>{e || 'Todas'}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs text-gray-500 mb-1">Acción</label>
            <select
              value={accion}
              onChange={e => { setAccion(e.target.value); setPage(1); }}
              className="w-full px-2 py-1.5 border border-gray-300 rounded text-sm focus:ring-2 focus:ring-inyecta-500 focus:border-inyecta-500 outline-none"
            >
              {ACCIONES.map(a => (
                <option key={a} value={a}>{a || 'Todas'}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs text-gray-500 mb-1">Tamaño página</label>
            <select
              value={pageSize}
              onChange={e => { setPageSize(Number(e.target.value)); setPage(1); }}
              className="w-full px-2 py-1.5 border border-gray-300 rounded text-sm focus:ring-2 focus:ring-inyecta-500 focus:border-inyecta-500 outline-none"
            >
              {[20, 50, 100, 200].map(n => (
                <option key={n} value={n}>{n}</option>
              ))}
            </select>
          </div>
          <div className="md:col-span-1">
            <label className="block text-xs text-gray-500 mb-1">Desde</label>
            <input
              type="date"
              value={desde}
              onChange={e => { setDesde(e.target.value); setPage(1); }}
              className="w-full px-2 py-1.5 border border-gray-300 rounded text-sm focus:ring-2 focus:ring-inyecta-500 focus:border-inyecta-500 outline-none"
            />
          </div>
          <div>
            <label className="block text-xs text-gray-500 mb-1">Hasta</label>
            <input
              type="date"
              value={hasta}
              onChange={e => { setHasta(e.target.value); setPage(1); }}
              className="w-full px-2 py-1.5 border border-gray-300 rounded text-sm focus:ring-2 focus:ring-inyecta-500 focus:border-inyecta-500 outline-none"
            />
          </div>
        </div>
      </div>

      {/* Tabla */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        {error && (
          <div className="bg-red-50 border-b border-red-200 text-red-700 px-4 py-3 text-sm">
            {error}
          </div>
        )}

        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="px-3 py-2 text-left font-semibold text-gray-600 whitespace-nowrap">Fecha</th>
                <th className="px-3 py-2 text-left font-semibold text-gray-600">Usuario</th>
                <th className="px-3 py-2 text-left font-semibold text-gray-600">Acción</th>
                <th className="px-3 py-2 text-left font-semibold text-gray-600">Entidad</th>
                <th className="px-3 py-2 text-left font-semibold text-gray-600">Método</th>
                <th className="px-3 py-2 text-left font-semibold text-gray-600">Ruta</th>
                <th className="px-3 py-2 text-right font-semibold text-gray-600">Status</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={7} className="px-3 py-12 text-center text-gray-400">
                    Cargando…
                  </td>
                </tr>
              ) : !data || data.items.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-3 py-12 text-center text-gray-400">
                    Sin eventos para los filtros seleccionados
                  </td>
                </tr>
              ) : (
                data.items.map(ev => {
                  const metStyle = METODO_STYLE[ev.metodo] || { color: 'text-gray-700', bg: 'bg-gray-100' };
                  return (
                    <tr
                      key={ev.id}
                      onClick={() => setSeleccionado(ev)}
                      className="border-b border-gray-50 hover:bg-gray-50 cursor-pointer transition-colors"
                    >
                      <td className="px-3 py-2 whitespace-nowrap text-gray-600 font-mono text-[11px]">
                        {fmtDate(ev.createdAt)}
                      </td>
                      <td className="px-3 py-2">
                        {ev.usuarioEmail ? (
                          <div>
                            <div className="text-gray-900 font-medium">{ev.usuarioEmail}</div>
                            {ev.usuarioRol && (
                              <div className="text-[10px] text-gray-400">{ev.usuarioRol}</div>
                            )}
                          </div>
                        ) : (
                          <span className="text-gray-400 italic">Anónimo</span>
                        )}
                      </td>
                      <td className="px-3 py-2 whitespace-nowrap text-gray-700 font-medium">
                        {ev.accion}
                      </td>
                      <td className="px-3 py-2 whitespace-nowrap">
                        {ev.entidad ? (
                          <div>
                            <span className="text-gray-700">{ev.entidad}</span>
                            {ev.entidadId && (
                              <div className="text-[10px] text-gray-400 font-mono">
                                {ev.entidadId.slice(0, 8)}…
                              </div>
                            )}
                          </div>
                        ) : (
                          <span className="text-gray-300">—</span>
                        )}
                      </td>
                      <td className="px-3 py-2 whitespace-nowrap">
                        <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${metStyle.bg} ${metStyle.color}`}>
                          {ev.metodo}
                        </span>
                      </td>
                      <td className="px-3 py-2 font-mono text-[11px] text-gray-600 max-w-xs truncate" title={ev.ruta}>
                        {ev.ruta}
                      </td>
                      <td className={`px-3 py-2 text-right font-mono font-semibold ${statusColor(ev.responseStatus)}`}>
                        {ev.responseStatus ?? '—'}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {/* Paginación */}
        {data && data.totalPages > 1 && (
          <div className="flex items-center justify-between px-4 py-3 border-t border-gray-100 bg-gray-50 text-sm">
            <div className="text-gray-500">
              Página {data.page} de {data.totalPages}
              <span className="text-gray-400 ml-2">
                ({((data.page - 1) * data.pageSize + 1).toLocaleString('es-MX')}–
                {Math.min(data.page * data.pageSize, data.total).toLocaleString('es-MX')} de{' '}
                {data.total.toLocaleString('es-MX')})
              </span>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setPage(p => Math.max(1, p - 1))}
                disabled={data.page <= 1 || loading}
                className="px-2 py-1 rounded border border-gray-300 disabled:opacity-50 disabled:cursor-not-allowed hover:bg-gray-100"
              >
                <ChevronLeft size={14} />
              </button>
              <button
                onClick={() => setPage(p => Math.min(data.totalPages, p + 1))}
                disabled={data.page >= data.totalPages || loading}
                className="px-2 py-1 rounded border border-gray-300 disabled:opacity-50 disabled:cursor-not-allowed hover:bg-gray-100"
              >
                <ChevronRight size={14} />
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Detalle (panel lateral) */}
      {seleccionado && (
        <div
          className="fixed inset-0 bg-black/40 z-40 flex justify-end"
          onClick={() => setSeleccionado(null)}
        >
          <div
            className="bg-white w-full max-w-xl h-full overflow-y-auto shadow-2xl"
            onClick={e => e.stopPropagation()}
          >
            <div className="sticky top-0 bg-white border-b border-gray-200 px-5 py-3 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <ScrollText size={16} className="text-inyecta-700" />
                <span className="font-semibold text-gray-900">Detalle del evento</span>
              </div>
              <button
                onClick={() => setSeleccionado(null)}
                className="text-gray-400 hover:text-gray-700"
              >
                <X size={18} />
              </button>
            </div>
            <div className="p-5 space-y-4 text-sm">
              <DetalleRow label="ID">
                <span className="font-mono text-xs">{seleccionado.id}</span>
              </DetalleRow>
              <DetalleRow label="Fecha">
                <span className="font-mono">{fmtDate(seleccionado.createdAt)}</span>
              </DetalleRow>
              <DetalleRow label="Usuario">
                {seleccionado.usuarioEmail ? (
                  <div>
                    <div>{seleccionado.usuarioEmail}</div>
                    <div className="text-[11px] text-gray-500">
                      {seleccionado.usuarioRol} · {seleccionado.usuarioId?.slice(0, 12)}…
                    </div>
                  </div>
                ) : (
                  <span className="text-gray-400 italic">Anónimo</span>
                )}
              </DetalleRow>
              <DetalleRow label="Acción">{seleccionado.accion}</DetalleRow>
              <DetalleRow label="Entidad">
                {seleccionado.entidad ? (
                  <span>
                    {seleccionado.entidad}
                    {seleccionado.entidadId && (
                      <span className="text-gray-400 font-mono text-xs"> · {seleccionado.entidadId}</span>
                    )}
                  </span>
                ) : (
                  '—'
                )}
              </DetalleRow>
              <DetalleRow label="Método / Ruta">
                <div className="flex items-center gap-2">
                  <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${(METODO_STYLE[seleccionado.metodo] || { bg: 'bg-gray-100', color: 'text-gray-700' }).bg} ${(METODO_STYLE[seleccionado.metodo] || { bg: 'bg-gray-100', color: 'text-gray-700' }).color}`}>
                    {seleccionado.metodo}
                  </span>
                  <code className="text-xs">{seleccionado.ruta}</code>
                </div>
              </DetalleRow>
              <DetalleRow label="Status HTTP">
                <span className={`font-mono font-semibold ${statusColor(seleccionado.responseStatus)}`}>
                  {seleccionado.responseStatus ?? '—'}
                </span>
              </DetalleRow>
              <DetalleRow label="IP">
                <span className="font-mono text-xs">{seleccionado.ip || '—'}</span>
              </DetalleRow>
              <DetalleRow label="User-Agent">
                <span className="font-mono text-[10px] break-all text-gray-500">
                  {seleccionado.userAgent || '—'}
                </span>
              </DetalleRow>

              <div>
                <div className="text-xs font-semibold text-gray-500 mb-1.5 uppercase tracking-wide">
                  Payload (sanitizado)
                </div>
                {seleccionado.payloadJson != null && Object.keys(seleccionado.payloadJson as object).length > 0 ? (
                  <pre className="bg-gray-50 border border-gray-200 rounded p-3 text-[11px] font-mono overflow-x-auto text-gray-800 whitespace-pre-wrap break-all">
                    {JSON.stringify(seleccionado.payloadJson, null, 2)}
                  </pre>
                ) : (
                  <div className="bg-gray-50 border border-gray-200 rounded p-3 text-xs text-gray-400 italic">
                    Sin payload (request sin body o sanitizado a vacío)
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function DetalleRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col">
      <span className="text-[11px] font-semibold text-gray-500 uppercase tracking-wide">{label}</span>
      <span className="text-gray-800 mt-0.5">{children}</span>
    </div>
  );
}
