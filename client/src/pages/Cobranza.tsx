import { useState, useEffect, useMemo } from 'react';
import { Link } from 'react-router-dom';
import api from '@/lib/api';
import { formatCurrency, formatDate } from '@/lib/utils';
import {
  CalendarDays, ChevronLeft, ChevronRight, CheckCircle2, Clock,
  AlertTriangle, Building2, User, DollarSign, TrendingUp,
  Phone, CreditCard, Filter, ChevronDown, ChevronUp,
  ArrowRightLeft, FastForward, X, FileText, CircleDot, Receipt,
} from 'lucide-react';
import { generateReciboPDF } from '@/lib/reciboPDF';

// ─── Types ──────────────────────────────────────────────────

interface Moratorio {
  generado: number;
  ivaGenerado: number;
  pagado: number;
  ivaPagado: number;
  pendiente: number;
  ivaPendiente: number;
}

interface Desglose {
  rentaPendiente: number;
  ivaPendiente: number;
  rentaTotalPendiente: number;
  moratorioPendiente: number;
  ivaMoratorioPendiente: number;
  totalAdeudado: number;
}

interface PagoDetalle {
  id: string;
  fecha: string;
  monto: number;
  referencia?: string;
}

interface Pagos {
  cantidad: number;
  totalPagado: number;
  pagadoRenta: number;
  pagadoIVA: number;
  pagadoMoratorio: number;
  pagadoIVAMoratorio: number;
  detalle: PagoDetalle[];
}

interface CalendarEntry {
  id: string;
  contractId: string;
  periodo: number;
  fechaPago: string;
  estatus: 'PAGADO' | 'PARCIAL' | 'VENCIDO' | 'PENDIENTE' | 'FUTURO';
  diasAtraso: number;
  renta: number;
  ivaRenta: number;
  pagoTotal: number;
  saldoInicial: number;
  saldoFinal: number;
  intereses: number;
  pagoCapital: number;
  moratorio: Moratorio;
  desglose: Desglose;
  pagos: Pagos;
  contract: {
    id: string;
    folio: string;
    producto: string;
    nivelRiesgo: string;
    tasaAnual: number;
    client: {
      id: string;
      tipo: 'PFAE' | 'PM';
      nombre?: string;
      apellidoPaterno?: string;
      razonSocial?: string;
      rfc?: string;
      telefono?: string;
      email?: string;
    };
  };
}

interface Summary {
  total: number;
  pendientes: number;
  parciales: number;
  vencidos: number;
  pagados: number;
  totalPendiente: number;
  totalVencido: number;
  totalMoratorio: number;
  totalAdeudado: number;
  totalPagado: number;
}

const MONTHS = [
  'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
  'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre',
];

function clientName(c: CalendarEntry['contract']['client']): string {
  if (c.tipo === 'PM') return c.razonSocial || 'Sin nombre';
  return [c.nombre, c.apellidoPaterno].filter(Boolean).join(' ') || 'Sin nombre';
}

function statusConfig(estatus: string) {
  switch (estatus) {
    case 'PAGADO': return { color: 'emerald', icon: CheckCircle2, label: 'Pagado', bg: 'bg-emerald-100', text: 'text-emerald-600', border: 'border-emerald-200', bgCard: 'bg-emerald-50/30' };
    case 'PARCIAL': return { color: 'amber', icon: CircleDot, label: 'Parcial', bg: 'bg-amber-100', text: 'text-amber-600', border: 'border-amber-300', bgCard: 'bg-amber-50/30' };
    case 'VENCIDO': return { color: 'red', icon: AlertTriangle, label: 'Vencido', bg: 'bg-red-100', text: 'text-red-500', border: 'border-red-200', bgCard: 'bg-red-50/30' };
    case 'PENDIENTE': return { color: 'blue', icon: Clock, label: 'Pendiente', bg: 'bg-blue-100', text: 'text-blue-500', border: 'border-blue-200', bgCard: 'bg-blue-50/30' };
    default: return { color: 'gray', icon: Clock, label: 'Futuro', bg: 'bg-gray-100', text: 'text-gray-400', border: 'border-gray-200', bgCard: '' };
  }
}

// ─── Component ──────────────────────────────────────────────

export default function Cobranza() {
  const now = new Date();
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [year, setYear] = useState(now.getFullYear());
  const [entries, setEntries] = useState<CalendarEntry[]>([]);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState('');
  const [expandedId, setExpandedId] = useState<string | null>(null);

  // Pay modal
  const [payModal, setPayModal] = useState<{ entry: CalendarEntry; mode: 'total' | 'parcial' } | null>(null);
  const [payMonto, setPayMonto] = useState('');
  const [payRef, setPayRef] = useState('');
  const [payObs, setPayObs] = useState('');
  const [processing, setProcessing] = useState(false);

  // Advance pay modal
  const [advanceModal, setAdvanceModal] = useState<CalendarEntry | null>(null);
  const [advancePeriodos, setAdvancePeriodos] = useState<number[]>([]);

  const fetchCalendar = () => {
    setLoading(true);
    const params = new URLSearchParams({ month: String(month), year: String(year) });
    if (statusFilter) params.set('status', statusFilter);

    api.get(`/cobranza/calendar?${params}`)
      .then((res) => {
        setEntries(res.data.data);
        setSummary(res.data.summary);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  };

  useEffect(() => { fetchCalendar(); }, [month, year, statusFilter]);

  const prevMonth = () => {
    if (month === 1) { setMonth(12); setYear(year - 1); }
    else setMonth(month - 1);
  };
  const nextMonth = () => {
    if (month === 12) { setMonth(1); setYear(year + 1); }
    else setMonth(month + 1);
  };

  // Abrir modal de pago
  const openPayModal = (entry: CalendarEntry, mode: 'total' | 'parcial') => {
    setPayModal({ entry, mode });
    if (mode === 'total') {
      setPayMonto(entry.desglose.totalAdeudado.toFixed(2));
    } else {
      setPayMonto('');
    }
    setPayRef('');
    setPayObs('');
  };

  const handlePay = async () => {
    if (!payModal) return;
    const monto = parseFloat(payMonto);
    if (isNaN(monto) || monto <= 0) return;
    setProcessing(true);
    try {
      await api.post('/cobranza/pay', {
        contractId: payModal.entry.contractId,
        periodo: payModal.entry.periodo,
        monto,
        referencia: payRef || undefined,
        observaciones: payObs || undefined,
      });
      setPayModal(null);
      fetchCalendar();
    } catch (err: any) {
      alert(err.response?.data?.error || 'Error al registrar pago');
    }
    setProcessing(false);
  };

  // Pago adelantado
  const openAdvanceModal = (entry: CalendarEntry) => {
    setAdvanceModal(entry);
    // Pre-seleccionar periodos futuros del mismo contrato
    const futureEntries = entries.filter(
      e => e.contractId === entry.contractId &&
        e.estatus === 'FUTURO' &&
        e.periodo > entry.periodo
    );
    setAdvancePeriodos(futureEntries.slice(0, 1).map(e => e.periodo));
  };

  const handleAdvancePay = async () => {
    if (!advanceModal || advancePeriodos.length === 0) return;
    setProcessing(true);
    try {
      await api.post('/cobranza/pay-advance', {
        contractId: advanceModal.contractId,
        periodos: advancePeriodos,
        referencia: payRef || undefined,
      });
      setAdvanceModal(null);
      setAdvancePeriodos([]);
      setPayRef('');
      fetchCalendar();
    } catch (err: any) {
      alert(err.response?.data?.error || 'Error al registrar pagos adelantados');
    }
    setProcessing(false);
  };

  // Preview de aplicación del pago parcial
  const montoPreview = useMemo(() => {
    if (!payModal) return null;
    const monto = parseFloat(payMonto);
    if (isNaN(monto) || monto <= 0) return null;

    const d = payModal.entry.desglose;
    let restante = monto;

    // 1. Moratorios
    const moratorio = Math.min(restante, d.moratorioPendiente);
    restante -= moratorio;
    const ivaMoratorio = Math.min(restante, d.ivaMoratorioPendiente);
    restante -= ivaMoratorio;

    // 2. Renta
    const renta = Math.min(restante, d.rentaPendiente);
    restante -= renta;
    const iva = Math.min(restante, d.ivaPendiente);
    restante -= iva;

    return { moratorio, ivaMoratorio, renta, iva, total: moratorio + ivaMoratorio + renta + iva, sobrante: restante };
  }, [payMonto, payModal]);

  return (
    <div>
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
            <CalendarDays className="text-inyecta-600" size={24} />
            Cobranza
          </h1>
          <p className="text-gray-500 text-sm mt-1">Calendario de pagos, moratorios y estados de cuenta</p>
        </div>
      </div>

      {/* Month navigation */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-3">
          <button onClick={prevMonth} className="p-1.5 rounded-lg border border-gray-200 hover:bg-gray-50">
            <ChevronLeft size={16} />
          </button>
          <h2 className="text-lg font-semibold text-gray-900 min-w-[180px] text-center">
            {MONTHS[month - 1]} {year}
          </h2>
          <button onClick={nextMonth} className="p-1.5 rounded-lg border border-gray-200 hover:bg-gray-50">
            <ChevronRight size={16} />
          </button>
          <button
            onClick={() => { setMonth(now.getMonth() + 1); setYear(now.getFullYear()); }}
            className="text-xs text-inyecta-600 hover:underline ml-2"
          >
            Hoy
          </button>
        </div>
      </div>

      {/* Summary cards */}
      {summary && (
        <div className="grid grid-cols-2 lg:grid-cols-5 gap-3 mb-4">
          <StatCard
            icon={<Clock size={14} className="text-blue-500" />}
            label="Pendientes"
            value={summary.pendientes}
            sub={formatCurrency(summary.totalPendiente)}
            active={statusFilter === 'pendiente'}
            onClick={() => setStatusFilter(statusFilter === 'pendiente' ? '' : 'pendiente')}
            colorClass="blue"
          />
          <StatCard
            icon={<CircleDot size={14} className="text-amber-500" />}
            label="Parciales"
            value={summary.parciales}
            active={statusFilter === 'parcial'}
            onClick={() => setStatusFilter(statusFilter === 'parcial' ? '' : 'parcial')}
            colorClass="amber"
          />
          <StatCard
            icon={<AlertTriangle size={14} className="text-red-500" />}
            label="Vencidos"
            value={summary.vencidos}
            sub={formatCurrency(summary.totalVencido)}
            active={statusFilter === 'vencido'}
            onClick={() => setStatusFilter(statusFilter === 'vencido' ? '' : 'vencido')}
            colorClass="red"
          />
          <StatCard
            icon={<CheckCircle2 size={14} className="text-emerald-500" />}
            label="Pagados"
            value={summary.pagados}
            sub={formatCurrency(summary.totalPagado)}
            active={statusFilter === 'pagado'}
            onClick={() => setStatusFilter(statusFilter === 'pagado' ? '' : 'pagado')}
            colorClass="emerald"
          />
          <div className="bg-white rounded-xl border border-gray-200 p-4">
            <div className="flex items-center gap-2 mb-1">
              <TrendingUp size={14} className="text-orange-500" />
              <span className="text-xs text-gray-500">Moratorios</span>
            </div>
            <p className="text-xl font-bold text-orange-600">{formatCurrency(summary.totalMoratorio)}</p>
            <p className="text-xs text-gray-500 mt-0.5">Total adeudado: {formatCurrency(summary.totalAdeudado)}</p>
          </div>
        </div>
      )}

      {statusFilter && (
        <div className="flex items-center gap-2 mb-3">
          <Filter size={14} className="text-gray-400" />
          <span className="text-xs text-gray-500">
            Filtrando: <strong className="capitalize">{statusFilter === 'pendiente' ? 'Pendientes' : statusFilter === 'vencido' ? 'Vencidos' : statusFilter === 'parcial' ? 'Parciales' : 'Pagados'}</strong>
          </span>
          <button onClick={() => setStatusFilter('')} className="text-xs text-inyecta-600 hover:underline ml-1">
            Limpiar
          </button>
        </div>
      )}

      {/* Entries */}
      {loading ? (
        <div className="flex items-center justify-center py-12">
          <div className="animate-spin rounded-full h-6 w-6 border-2 border-inyecta-600 border-t-transparent" />
        </div>
      ) : entries.length === 0 ? (
        <div className="bg-white rounded-xl border border-gray-200 p-12 text-center">
          <CalendarDays className="mx-auto text-gray-300 mb-3" size={48} />
          <p className="text-gray-500 mb-1">Sin pagos programados para {MONTHS[month - 1]} {year}</p>
          <p className="text-xs text-gray-400">Los pagos se generan al activar contratos</p>
        </div>
      ) : (
        <div className="space-y-2">
          {entries.map((entry) => {
            const sc = statusConfig(entry.estatus);
            const Icon = sc.icon;
            const isExpanded = expandedId === entry.id;

            return (
              <div key={entry.id} className={`bg-white rounded-xl border p-4 transition-colors ${sc.border} ${sc.bgCard}`}>
                {/* Main row */}
                <div className="flex items-start justify-between gap-4">
                  {/* Left: info */}
                  <div className="flex items-start gap-3 flex-1 min-w-0">
                    <div className={`w-9 h-9 rounded-full flex items-center justify-center flex-shrink-0 ${sc.bg}`}>
                      <Icon size={16} className={sc.text} />
                    </div>
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded ${sc.bg} ${sc.text}`}>
                          {sc.label}
                        </span>
                        <Link to={`/contratos/${entry.contract.id}`} className="font-mono text-xs text-inyecta-700 font-medium hover:underline">
                          {entry.contract.folio}
                        </Link>
                        <span className="text-xs text-gray-400">P{entry.periodo}</span>
                        <span className={`text-[10px] px-1.5 py-0.5 rounded ${
                          entry.contract.producto === 'PURO' ? 'bg-cyan-100 text-cyan-700' : 'bg-violet-100 text-violet-700'
                        }`}>
                          {entry.contract.producto === 'PURO' ? 'Puro' : 'Financiero'}
                        </span>
                      </div>
                      <div className="flex items-center gap-1.5 mt-1">
                        {entry.contract.client.tipo === 'PM'
                          ? <Building2 size={11} className="text-gray-400" />
                          : <User size={11} className="text-gray-400" />}
                        <Link to={`/clientes/${entry.contract.client.id}`} className="text-sm text-gray-700 hover:underline truncate">
                          {clientName(entry.contract.client)}
                        </Link>
                        {entry.contract.client.telefono && (
                          <span className="text-xs text-gray-400 flex items-center gap-0.5 ml-2">
                            <Phone size={10} /> {entry.contract.client.telefono}
                          </span>
                        )}
                      </div>
                      <div className="text-xs text-gray-400 mt-1 flex items-center gap-2 flex-wrap">
                        <span>Vence: {formatDate(entry.fechaPago)}</span>
                        {entry.estatus === 'VENCIDO' && (
                          <span className="text-red-500 font-medium">{entry.diasAtraso} dias de atraso</span>
                        )}
                        {entry.estatus === 'PARCIAL' && (
                          <span className="text-amber-600 font-medium">
                            Pagado {formatCurrency(entry.pagos.totalPagado)} de {formatCurrency(entry.pagoTotal)}
                          </span>
                        )}
                        {entry.estatus === 'PAGADO' && entry.pagos.detalle.length > 0 && (
                          <span className="text-emerald-600">
                            Pagado: {formatDate(entry.pagos.detalle[entry.pagos.detalle.length - 1].fecha)}
                            {entry.pagos.detalle[entry.pagos.detalle.length - 1].referencia && (
                              <> · Ref: {entry.pagos.detalle[entry.pagos.detalle.length - 1].referencia}</>
                            )}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Right: amounts & actions */}
                  <div className="text-right flex-shrink-0">
                    {entry.estatus === 'PAGADO' ? (
                      <div className="text-sm font-bold text-emerald-600">{formatCurrency(entry.pagos.totalPagado)}</div>
                    ) : (
                      <>
                        <div className="text-sm font-bold text-gray-900">{formatCurrency(entry.desglose.totalAdeudado)}</div>
                        {entry.moratorio.pendiente > 0 && (
                          <div className="text-[10px] text-red-500">
                            Incl. {formatCurrency(entry.moratorio.pendiente + entry.moratorio.ivaPendiente)} moratorios
                          </div>
                        )}
                      </>
                    )}
                    <div className="text-[10px] text-gray-400">
                      Renta: {formatCurrency(entry.renta)} + IVA
                    </div>

                    {/* Actions */}
                    {entry.estatus !== 'PAGADO' && entry.estatus !== 'FUTURO' && (
                      <div className="flex items-center gap-1 mt-2 justify-end">
                        <button
                          onClick={() => openPayModal(entry, 'total')}
                          className="inline-flex items-center gap-1 px-2.5 py-1 bg-inyecta-700 text-white rounded text-[11px] font-medium hover:bg-inyecta-800 transition-colors"
                        >
                          <CreditCard size={11} /> Pagar
                        </button>
                        <button
                          onClick={() => openPayModal(entry, 'parcial')}
                          className="inline-flex items-center gap-1 px-2.5 py-1 border border-inyecta-300 text-inyecta-700 rounded text-[11px] font-medium hover:bg-inyecta-50 transition-colors"
                        >
                          <ArrowRightLeft size={11} /> Parcial
                        </button>
                      </div>
                    )}
                    {entry.estatus === 'FUTURO' && (
                      <button
                        onClick={() => openAdvanceModal(entry)}
                        className="mt-2 inline-flex items-center gap-1 px-2.5 py-1 border border-green-300 text-green-700 rounded text-[11px] font-medium hover:bg-green-50 transition-colors"
                      >
                        <FastForward size={11} /> Adelantar
                      </button>
                    )}

                    {/* Expand toggle */}
                    <button
                      onClick={() => setExpandedId(isExpanded ? null : entry.id)}
                      className="mt-1 text-gray-400 hover:text-gray-600 p-0.5"
                    >
                      {isExpanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                    </button>
                  </div>
                </div>

                {/* Expanded detail */}
                {isExpanded && (
                  <div className="mt-3 pt-3 border-t border-gray-200">
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                      {/* Conceptos adeudados */}
                      <div className="bg-gray-50 rounded-lg p-3">
                        <h4 className="text-xs font-semibold text-gray-500 mb-2 flex items-center gap-1">
                          <FileText size={12} /> DESGLOSE DE ADEUDO
                        </h4>
                        <div className="space-y-1.5 text-sm">
                          <Row label="Renta" value={entry.renta} />
                          <Row label="IVA renta" value={entry.ivaRenta} />
                          <div className="border-t border-gray-200 pt-1">
                            <Row label="Subtotal periodo" value={entry.pagoTotal} bold />
                          </div>
                          {entry.moratorio.generado > 0 && (
                            <>
                              <div className="border-t border-gray-200 pt-1" />
                              <Row label={`Moratorio (${entry.diasAtraso}d)`} value={entry.moratorio.generado} red />
                              <Row label="IVA moratorio" value={entry.moratorio.ivaGenerado} red />
                              <div className="border-t border-gray-200 pt-1">
                                <Row label="Total con moratorio" value={entry.pagoTotal + entry.moratorio.generado + entry.moratorio.ivaGenerado} bold />
                              </div>
                            </>
                          )}
                        </div>
                      </div>

                      {/* Pagos aplicados */}
                      <div className="bg-gray-50 rounded-lg p-3">
                        <h4 className="text-xs font-semibold text-gray-500 mb-2 flex items-center gap-1">
                          <CreditCard size={12} /> PAGOS APLICADOS ({entry.pagos.cantidad})
                        </h4>
                        {entry.pagos.cantidad === 0 ? (
                          <p className="text-xs text-gray-400 italic">Sin pagos registrados</p>
                        ) : (
                          <div className="space-y-1.5 text-sm">
                            {entry.pagos.pagadoMoratorio > 0 && (
                              <Row label="A moratorios" value={entry.pagos.pagadoMoratorio} green />
                            )}
                            {entry.pagos.pagadoIVAMoratorio > 0 && (
                              <Row label="IVA moratorio" value={entry.pagos.pagadoIVAMoratorio} green />
                            )}
                            <Row label="A renta" value={entry.pagos.pagadoRenta} green />
                            <Row label="IVA renta" value={entry.pagos.pagadoIVA} green />
                            <div className="border-t border-gray-200 pt-1">
                              <Row label="Total pagado" value={entry.pagos.totalPagado} bold green />
                            </div>
                            {entry.pagos.detalle.map((p, i) => (
                              <div key={p.id} className="text-[10px] text-gray-400 mt-1 flex items-center gap-2">
                                <span>
                                  Pago {i + 1}: {formatDate(p.fecha)} · {formatCurrency(p.monto)}
                                  {p.referencia && <> · {p.referencia}</>}
                                </span>
                                <button
                                  onClick={async () => {
                                    try {
                                      const res = await api.get(`/cobranza/payment/${p.id}/recibo`);
                                      generateReciboPDF(res.data);
                                    } catch {
                                      alert('No se pudo generar el recibo');
                                    }
                                  }}
                                  title="Descargar recibo"
                                  className="text-inyecta-600 hover:text-inyecta-800 inline-flex items-center gap-0.5"
                                >
                                  <Receipt size={10} /> Recibo
                                </button>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>

                      {/* Saldo pendiente */}
                      <div className="bg-gray-50 rounded-lg p-3">
                        <h4 className="text-xs font-semibold text-gray-500 mb-2 flex items-center gap-1">
                          <DollarSign size={12} /> SALDO PENDIENTE
                        </h4>
                        <div className="space-y-1.5 text-sm">
                          {entry.desglose.moratorioPendiente > 0 && (
                            <>
                              <Row label="Moratorio" value={entry.desglose.moratorioPendiente} red />
                              <Row label="IVA moratorio" value={entry.desglose.ivaMoratorioPendiente} red />
                            </>
                          )}
                          <Row label="Renta" value={entry.desglose.rentaPendiente} />
                          <Row label="IVA renta" value={entry.desglose.ivaPendiente} />
                          <div className="border-t border-gray-200 pt-1">
                            <Row label="Total adeudado" value={entry.desglose.totalAdeudado} bold />
                          </div>
                        </div>
                        {entry.estatus === 'VENCIDO' && (
                          <div className="mt-2 p-2 bg-red-50 rounded text-[10px] text-red-600">
                            Tasa moratoria: {((Number(entry.contract.tasaAnual) * 2) * 100).toFixed(1)}% anual
                            ({((Number(entry.contract.tasaAnual) * 2) / 360 * 100).toFixed(4)}% diario)
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Amortización info */}
                    {entry.contract.producto === 'FINANCIERO' && (
                      <div className="mt-3 flex items-center gap-4 text-[10px] text-gray-400">
                        <span>Saldo inicial: {formatCurrency(entry.saldoInicial)}</span>
                        <span>Intereses: {formatCurrency(entry.intereses)}</span>
                        <span>Capital: {formatCurrency(entry.pagoCapital)}</span>
                        <span>Saldo final: {formatCurrency(entry.saldoFinal)}</span>
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* ── Pay Modal ───────────────────────────────────────── */}
      {payModal && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl border border-gray-200 shadow-xl max-w-lg w-full p-6 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h3 className="font-semibold text-gray-900 text-lg">
                  {payModal.mode === 'parcial' ? 'Pago Parcial' : 'Registrar Pago'}
                </h3>
                <p className="text-sm text-gray-500">
                  {payModal.entry.contract.folio} · Periodo {payModal.entry.periodo}
                </p>
              </div>
              <button onClick={() => setPayModal(null)} className="text-gray-400 hover:text-gray-600">
                <X size={20} />
              </button>
            </div>

            {/* Desglose del periodo */}
            <div className="bg-gray-50 rounded-lg p-4 mb-4 space-y-1.5">
              <div className="text-xs font-semibold text-gray-500 mb-2">CONCEPTO A CUBRIR</div>
              {payModal.entry.desglose.moratorioPendiente > 0 && (
                <>
                  <ModalRow label={`Moratorio (${payModal.entry.diasAtraso} dias)`} value={payModal.entry.desglose.moratorioPendiente} red />
                  <ModalRow label="IVA moratorio" value={payModal.entry.desglose.ivaMoratorioPendiente} red />
                  <div className="border-t border-gray-200 pt-1" />
                </>
              )}
              <ModalRow label="Renta pendiente" value={payModal.entry.desglose.rentaPendiente} />
              <ModalRow label="IVA renta" value={payModal.entry.desglose.ivaPendiente} />
              <div className="border-t border-gray-200 pt-1">
                <ModalRow label="Total adeudado" value={payModal.entry.desglose.totalAdeudado} bold />
              </div>
            </div>

            {/* Monto input */}
            <div className="mb-4">
              <label className="block text-sm font-medium text-gray-600 mb-1">
                Monto del pago
              </label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm">$</span>
                <input
                  type="number"
                  step="0.01"
                  value={payMonto}
                  onChange={(e) => setPayMonto(e.target.value)}
                  placeholder={payModal.entry.desglose.totalAdeudado.toFixed(2)}
                  className="w-full pl-7 pr-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-inyecta-500 focus:border-inyecta-500 outline-none"
                  autoFocus
                />
              </div>
              {payModal.mode === 'parcial' && (
                <p className="text-[10px] text-gray-400 mt-1">
                  Ingresa el monto que el cliente desea abonar. Se aplica primero a moratorios, luego a renta.
                </p>
              )}
              {payModal.mode === 'total' && (
                <button
                  onClick={() => setPayMonto(payModal.entry.desglose.totalAdeudado.toFixed(2))}
                  className="text-[10px] text-inyecta-600 hover:underline mt-1"
                >
                  Llenar con total adeudado
                </button>
              )}
            </div>

            {/* Preview de aplicación */}
            {montoPreview && montoPreview.total > 0 && (
              <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 mb-4">
                <div className="text-xs font-semibold text-blue-700 mb-2">APLICACION DEL PAGO</div>
                <div className="space-y-1">
                  {montoPreview.moratorio > 0 && (
                    <div className="flex justify-between text-xs">
                      <span className="text-red-600">A moratorios</span>
                      <span className="text-red-600">{formatCurrency(montoPreview.moratorio)}</span>
                    </div>
                  )}
                  {montoPreview.ivaMoratorio > 0 && (
                    <div className="flex justify-between text-xs">
                      <span className="text-red-600">IVA moratorio</span>
                      <span className="text-red-600">{formatCurrency(montoPreview.ivaMoratorio)}</span>
                    </div>
                  )}
                  {montoPreview.renta > 0 && (
                    <div className="flex justify-between text-xs">
                      <span className="text-gray-600">A renta</span>
                      <span className="text-gray-900">{formatCurrency(montoPreview.renta)}</span>
                    </div>
                  )}
                  {montoPreview.iva > 0 && (
                    <div className="flex justify-between text-xs">
                      <span className="text-gray-600">IVA renta</span>
                      <span className="text-gray-900">{formatCurrency(montoPreview.iva)}</span>
                    </div>
                  )}
                  <div className="border-t border-blue-200 pt-1 flex justify-between text-xs font-semibold">
                    <span className="text-blue-700">Total aplicado</span>
                    <span className="text-blue-700">{formatCurrency(montoPreview.total)}</span>
                  </div>
                  {montoPreview.sobrante > 0.01 && (
                    <div className="flex justify-between text-xs text-amber-600">
                      <span>Sobrante (no aplicado)</span>
                      <span>{formatCurrency(montoPreview.sobrante)}</span>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Referencia y observaciones */}
            <div className="grid grid-cols-2 gap-3 mb-4">
              <div>
                <label className="block text-sm font-medium text-gray-600 mb-1">Referencia bancaria</label>
                <input
                  type="text"
                  value={payRef}
                  onChange={(e) => setPayRef(e.target.value)}
                  placeholder="Ej: SPEI-123456"
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-inyecta-500 focus:border-inyecta-500 outline-none"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-600 mb-1">Observaciones</label>
                <input
                  type="text"
                  value={payObs}
                  onChange={(e) => setPayObs(e.target.value)}
                  placeholder="Opcional"
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-inyecta-500 focus:border-inyecta-500 outline-none"
                />
              </div>
            </div>

            <div className="flex items-center gap-2 justify-end">
              <button
                onClick={() => setPayModal(null)}
                className="px-4 py-2 text-sm text-gray-600 hover:text-gray-800"
              >
                Cancelar
              </button>
              <button
                onClick={handlePay}
                disabled={processing || !montoPreview || montoPreview.total <= 0}
                className="flex items-center gap-1.5 px-4 py-2 bg-inyecta-700 text-white rounded-lg text-sm font-medium hover:bg-inyecta-800 disabled:bg-gray-300 transition-colors"
              >
                {processing ? (
                  <div className="animate-spin rounded-full h-3.5 w-3.5 border-2 border-white border-t-transparent" />
                ) : (
                  <CheckCircle2 size={14} />
                )}
                {payModal.mode === 'parcial' ? 'Aplicar Pago Parcial' : 'Confirmar Pago'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Advance Pay Modal ───────────────────────────────── */}
      {advanceModal && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl border border-gray-200 shadow-xl max-w-md w-full p-6">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h3 className="font-semibold text-gray-900 text-lg">Pago Adelantado</h3>
                <p className="text-sm text-gray-500">{advanceModal.contract.folio}</p>
              </div>
              <button onClick={() => { setAdvanceModal(null); setAdvancePeriodos([]); setPayRef(''); }} className="text-gray-400 hover:text-gray-600">
                <X size={20} />
              </button>
            </div>

            <p className="text-sm text-gray-600 mb-3">
              Selecciona los periodos futuros que deseas pagar por adelantado:
            </p>

            <div className="space-y-2 max-h-60 overflow-y-auto mb-4">
              {entries
                .filter(e => e.contractId === advanceModal.contractId && (e.estatus === 'FUTURO' || e.estatus === 'PENDIENTE') && e.periodo >= advanceModal.periodo)
                .map(e => (
                  <label key={e.periodo} className="flex items-center gap-3 p-2 rounded-lg hover:bg-gray-50 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={advancePeriodos.includes(e.periodo)}
                      onChange={(ev) => {
                        if (ev.target.checked) setAdvancePeriodos([...advancePeriodos, e.periodo].sort((a, b) => a - b));
                        else setAdvancePeriodos(advancePeriodos.filter(p => p !== e.periodo));
                      }}
                      className="rounded border-gray-300 text-inyecta-600 focus:ring-inyecta-500"
                    />
                    <span className="text-sm text-gray-700 flex-1">
                      Periodo {e.periodo} · {formatDate(e.fechaPago)}
                    </span>
                    <span className="text-sm font-medium text-gray-900">{formatCurrency(e.pagoTotal)}</span>
                  </label>
                ))}
            </div>

            {advancePeriodos.length > 0 && (
              <div className="bg-green-50 rounded-lg p-3 mb-4">
                <div className="flex justify-between text-sm font-semibold text-green-700">
                  <span>{advancePeriodos.length} periodo{advancePeriodos.length > 1 ? 's' : ''}</span>
                  <span>
                    {formatCurrency(
                      entries
                        .filter(e => e.contractId === advanceModal.contractId && advancePeriodos.includes(e.periodo))
                        .reduce((s, e) => s + e.pagoTotal, 0)
                    )}
                  </span>
                </div>
              </div>
            )}

            <div className="mb-4">
              <label className="block text-sm font-medium text-gray-600 mb-1">Referencia bancaria</label>
              <input
                type="text"
                value={payRef}
                onChange={(e) => setPayRef(e.target.value)}
                placeholder="Ej: SPEI-789012"
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-inyecta-500 focus:border-inyecta-500 outline-none"
              />
            </div>

            <div className="flex items-center gap-2 justify-end">
              <button
                onClick={() => { setAdvanceModal(null); setAdvancePeriodos([]); setPayRef(''); }}
                className="px-4 py-2 text-sm text-gray-600 hover:text-gray-800"
              >
                Cancelar
              </button>
              <button
                onClick={handleAdvancePay}
                disabled={processing || advancePeriodos.length === 0}
                className="flex items-center gap-1.5 px-4 py-2 bg-green-600 text-white rounded-lg text-sm font-medium hover:bg-green-700 disabled:bg-gray-300 transition-colors"
              >
                {processing ? (
                  <div className="animate-spin rounded-full h-3.5 w-3.5 border-2 border-white border-t-transparent" />
                ) : (
                  <FastForward size={14} />
                )}
                Pagar Adelantado
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Sub-components ─────────────────────────────────────────

function StatCard({ icon, label, value, sub, active, onClick, colorClass }: {
  icon: React.ReactNode; label: string; value: number; sub?: string;
  active: boolean; onClick: () => void; colorClass: string;
}) {
  return (
    <button
      onClick={onClick}
      className={`bg-white rounded-xl border p-4 text-left transition-colors ${
        active ? `border-${colorClass}-300 bg-${colorClass}-50` : 'border-gray-200 hover:border-gray-300'
      }`}
    >
      <div className="flex items-center gap-2 mb-1">
        {icon}
        <span className="text-xs text-gray-500">{label}</span>
      </div>
      <p className={`text-xl font-bold ${active ? `text-${colorClass}-600` : 'text-gray-900'}`}>{value}</p>
      {sub && <p className="text-xs text-gray-500 mt-0.5">{sub}</p>}
    </button>
  );
}

function Row({ label, value, bold, red, green }: {
  label: string; value: number; bold?: boolean; red?: boolean; green?: boolean;
}) {
  const textColor = red ? 'text-red-600' : green ? 'text-emerald-600' : 'text-gray-500';
  const valueColor = red ? 'text-red-600' : green ? 'text-emerald-600' : 'text-gray-900';

  return (
    <div className="flex justify-between text-sm">
      <span className={`${textColor} ${bold ? 'font-medium' : ''}`}>{label}</span>
      <span className={`${valueColor} ${bold ? 'font-bold' : ''}`}>{formatCurrency(value)}</span>
    </div>
  );
}

function ModalRow({ label, value, bold, red }: {
  label: string; value: number; bold?: boolean; red?: boolean;
}) {
  return (
    <div className="flex justify-between text-sm">
      <span className={red ? 'text-red-500' : 'text-gray-500'}>{label}</span>
      <span className={`${red ? 'text-red-600' : 'text-gray-900'} ${bold ? 'font-bold text-inyecta-700 text-lg' : ''}`}>
        {formatCurrency(value)}
      </span>
    </div>
  );
}
