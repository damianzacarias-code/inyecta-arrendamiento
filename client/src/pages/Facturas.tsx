import { useEffect, useState } from 'react';
import api from '@/lib/api';
import { formatCurrency, formatDate } from '@/lib/utils';
import {
  Receipt, XCircle, CheckCircle2, Clock, AlertTriangle,
  FileText, Filter, Building2, User,
} from 'lucide-react';

interface Invoice {
  id: string;
  paymentId: string | null;
  contractId: string;
  clientId: string;
  tipo: 'INGRESO' | 'EGRESO' | 'PAGO';
  serie: string;
  folio: number;
  uuid: string | null;
  fechaTimbrado: string | null;
  status: 'BORRADOR' | 'TIMBRADO' | 'CANCELADO' | 'ERROR';
  subtotal: number;
  iva: number;
  total: number;
  rfcReceptor: string;
  nombreReceptor: string;
  usoCfdi: string;
  metodoPago: string;
  formaPago: string;
  xmlUrl: string | null;
  motivoCancelacion: string | null;
  fechaCancelacion: string | null;
  provider: string;
  createdAt: string;
  contract: { folio: string; producto: string };
  client: {
    tipo: 'PFAE' | 'PM';
    nombre?: string;
    apellidoPaterno?: string;
    razonSocial?: string;
    rfc?: string;
  };
  payment: { id: string; periodo: number | null; fechaPago: string } | null;
}

const STATUS_STYLES: Record<Invoice['status'], { color: string; bg: string; icon: any; label: string }> = {
  BORRADOR:  { color: 'text-gray-700',   bg: 'bg-gray-100',   icon: Clock,         label: 'Borrador' },
  TIMBRADO:  { color: 'text-green-700',  bg: 'bg-green-100',  icon: CheckCircle2,  label: 'Timbrado' },
  CANCELADO: { color: 'text-red-700',    bg: 'bg-red-100',    icon: XCircle,       label: 'Cancelado' },
  ERROR:     { color: 'text-amber-700',  bg: 'bg-amber-100',  icon: AlertTriangle, label: 'Error' },
};

export default function Facturas() {
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState<'TODOS' | Invoice['status']>('TODOS');

  const load = async () => {
    setLoading(true);
    try {
      const res = await api.get('/invoices');
      setInvoices(res.data.invoices || []);
    } catch {
      setInvoices([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const cancelInvoice = async (inv: Invoice) => {
    const motivo = prompt(
      'Motivo de cancelación CFDI 4.0:\n\n' +
      '01 = Comprobante con errores con relación\n' +
      '02 = Comprobante con errores sin relación\n' +
      '03 = No se llevó a cabo la operación\n' +
      '04 = Operación nominativa relacionada en factura global',
      '02'
    );
    if (!motivo) return;
    try {
      await api.post(`/invoices/${inv.id}/cancelar`, { motivo });
      alert('Factura cancelada');
      load();
    } catch (err: any) {
      alert('Error al cancelar: ' + (err?.response?.data?.error || err.message));
    }
  };

  const filtered = statusFilter === 'TODOS' ? invoices : invoices.filter(i => i.status === statusFilter);

  const totales = {
    total: invoices.reduce((s, i) => s + (i.status === 'TIMBRADO' ? i.total : 0), 0),
    timbrados: invoices.filter(i => i.status === 'TIMBRADO').length,
    cancelados: invoices.filter(i => i.status === 'CANCELADO').length,
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
            <Receipt className="text-inyecta-600" size={28} />
            Facturas (CFDI 4.0)
          </h1>
          <p className="text-sm text-gray-500 mt-1">
            Listado de comprobantes fiscales emitidos · Provider: <span className="font-semibold">{invoices[0]?.provider || 'MOCK'}</span>
          </p>
        </div>
        <button
          onClick={load}
          className="px-3 py-1.5 text-sm text-inyecta-700 border border-inyecta-200 rounded-lg hover:bg-inyecta-50"
        >
          Refrescar
        </button>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-white p-4 rounded-lg border border-gray-200">
          <div className="text-xs text-gray-500 uppercase font-semibold">Total Facturado</div>
          <div className="text-2xl font-bold text-inyecta-700 mt-1">{formatCurrency(totales.total)}</div>
        </div>
        <div className="bg-white p-4 rounded-lg border border-gray-200">
          <div className="text-xs text-gray-500 uppercase font-semibold">Timbradas</div>
          <div className="text-2xl font-bold text-green-700 mt-1">{totales.timbrados}</div>
        </div>
        <div className="bg-white p-4 rounded-lg border border-gray-200">
          <div className="text-xs text-gray-500 uppercase font-semibold">Canceladas</div>
          <div className="text-2xl font-bold text-red-700 mt-1">{totales.cancelados}</div>
        </div>
      </div>

      {/* Filtros */}
      <div className="bg-white rounded-lg border border-gray-200 p-4 flex items-center gap-3">
        <Filter size={16} className="text-gray-400" />
        <span className="text-sm text-gray-600">Estatus:</span>
        {(['TODOS', 'TIMBRADO', 'CANCELADO', 'ERROR', 'BORRADOR'] as const).map(s => (
          <button
            key={s}
            onClick={() => setStatusFilter(s)}
            className={`px-3 py-1 text-xs rounded-full ${
              statusFilter === s
                ? 'bg-inyecta-600 text-white'
                : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
            }`}
          >
            {s}
          </button>
        ))}
      </div>

      {/* Tabla */}
      <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
        {loading ? (
          <div className="p-8 text-center text-gray-500">Cargando facturas...</div>
        ) : filtered.length === 0 ? (
          <div className="p-12 text-center">
            <Receipt size={32} className="mx-auto text-gray-300 mb-2" />
            <p className="text-gray-500">No hay facturas {statusFilter !== 'TODOS' && `con estatus ${statusFilter}`}</p>
            <p className="text-xs text-gray-400 mt-1">Las facturas se generan desde la página de Cobranza</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 text-xs uppercase text-gray-500 border-b">
                <tr>
                  <th className="px-3 py-2 text-left">Folio</th>
                  <th className="px-3 py-2 text-left">Fecha</th>
                  <th className="px-3 py-2 text-left">Receptor</th>
                  <th className="px-3 py-2 text-left">Contrato</th>
                  <th className="px-3 py-2 text-right">Subtotal</th>
                  <th className="px-3 py-2 text-right">IVA</th>
                  <th className="px-3 py-2 text-right">Total</th>
                  <th className="px-3 py-2 text-center">Estatus</th>
                  <th className="px-3 py-2 text-center">Acciones</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map(inv => {
                  const st = STATUS_STYLES[inv.status];
                  const StatusIcon = st.icon;
                  return (
                    <tr key={inv.id} className="border-b last:border-0 hover:bg-gray-50">
                      <td className="px-3 py-2">
                        <div className="font-semibold text-inyecta-700">{inv.serie}-{inv.folio}</div>
                        {inv.uuid && (
                          <div className="text-[10px] text-gray-400 font-mono" title={inv.uuid}>
                            {inv.uuid.slice(0, 8)}...{inv.uuid.slice(-6)}
                          </div>
                        )}
                      </td>
                      <td className="px-3 py-2 whitespace-nowrap">
                        <div>{formatDate(inv.fechaTimbrado || inv.createdAt)}</div>
                        <div className="text-xs text-gray-400">{inv.tipo}</div>
                      </td>
                      <td className="px-3 py-2">
                        <div className="flex items-center gap-1">
                          {inv.client.tipo === 'PM'
                            ? <Building2 size={12} className="text-gray-400" />
                            : <User size={12} className="text-gray-400" />}
                          <span className="font-medium">{inv.nombreReceptor}</span>
                        </div>
                        <div className="text-xs text-gray-400 font-mono">{inv.rfcReceptor}</div>
                      </td>
                      <td className="px-3 py-2">
                        <div className="text-xs">{inv.contract.folio}</div>
                        {inv.payment && (
                          <div className="text-[10px] text-gray-400">
                            Pago periodo {inv.payment.periodo ?? '-'}
                          </div>
                        )}
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums">{formatCurrency(inv.subtotal)}</td>
                      <td className="px-3 py-2 text-right tabular-nums text-gray-500">{formatCurrency(inv.iva)}</td>
                      <td className="px-3 py-2 text-right tabular-nums font-semibold">{formatCurrency(inv.total)}</td>
                      <td className="px-3 py-2 text-center">
                        <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${st.bg} ${st.color}`}>
                          <StatusIcon size={10} />
                          {st.label}
                        </span>
                      </td>
                      <td className="px-3 py-2 text-center">
                        <div className="flex items-center justify-center gap-1">
                          {inv.xmlUrl && (
                            <a
                              href={inv.xmlUrl}
                              target="_blank"
                              rel="noopener noreferrer"
                              title="Descargar XML"
                              className="p-1 text-gray-500 hover:text-inyecta-600"
                            >
                              <FileText size={14} />
                            </a>
                          )}
                          {inv.status === 'TIMBRADO' && (
                            <button
                              onClick={() => cancelInvoice(inv)}
                              title="Cancelar CFDI"
                              className="p-1 text-gray-500 hover:text-red-600"
                            >
                              <XCircle size={14} />
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
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
