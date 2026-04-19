/**
 * Cobranza · Detalle de un contrato
 * ----------------------------------------------------------------
 * Réplica del módulo "PagoCredito2" del sistema legacy de créditos:
 *   - Cabecera con datos generales (folio, cliente, producto, monto,
 *     plazo, tasa, comisión, estatus).
 *   - Tabla de parcialidades con columnas:
 *       Periodo | Fecha | Capital | Intereses | Seguro |
 *       Moratorios | Abonos | Pago Total | Pagado (✓/✗)
 *   - Resumen financiero al pie:
 *       Crédito Otorgado | Abonado a Capital | Saldo Insoluto |
 *       Intereses Ordinarios Pagados | Intereses Moratorios Pagados
 *   - Saldo Vencido + Monto a Liquidar destacados, con botón
 *     "Liquidar Crédito" (calculado client-side; el endpoint formal
 *     se agregará cuando definamos la fórmula exacta del legacy).
 *
 * Endpoint utilizado: GET /cobranza/contract/:contractId
 */
import { useEffect, useMemo, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import api from '@/lib/api';
import { formatCurrency, formatDate } from '@/lib/utils';
import {
  ArrowLeft,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  CreditCard,
  Calculator,
  ChevronDown,
  ChevronRight,
  Building2,
  User as UserIcon,
} from 'lucide-react';

// ─── Types ──────────────────────────────────────────────────────────

type Estatus = 'PAGADO' | 'PARCIAL' | 'VENCIDO' | 'PENDIENTE' | 'FUTURO';

interface PagoDetalle {
  id: string;
  fecha: string;
  monto: number;
  referencia: string | null;
}

interface ScheduleRow {
  periodo: number;
  fechaPago: string;
  estatus: Estatus;
  diasAtraso: number;
  renta: number;
  ivaRenta: number;
  pagoTotal: number;
  saldoInicial: number;
  saldoFinal: number;
  intereses: number;
  pagoCapital: number;
  moratorio: {
    generado: number;
    ivaGenerado: number;
    pagado: number;
    ivaPagado: number;
    pendiente: number;
    ivaPendiente: number;
  };
  desglose: {
    rentaPendiente: number;
    ivaPendiente: number;
    rentaTotalPendiente: number;
    moratorioPendiente: number;
    ivaMoratorioPendiente: number;
    totalAdeudado: number;
  };
  pagos: {
    cantidad: number;
    totalPagado: number;
    pagadoRenta: number;
    pagadoIVA: number;
    pagadoMoratorio: number;
    pagadoIVAMoratorio: number;
    detalle: PagoDetalle[];
  };
}

interface ContractInfo {
  id: string;
  folio: string;
  producto: 'PURO' | 'FINANCIERO';
  plazo: number;
  tasaAnual: number;
  tasaMoratoria: number;
  rentaMensual: number;
  rentaMensualIVA: number;
  montoFinanciar: number;
  fechaInicio: string;
  fechaVencimiento: string;
  estatus: string;
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
}

interface Summary {
  totalPeriodos: number;
  pagados: number;
  parciales: number;
  pendientes: number;
  vencidos: number;
  totalPagado: number;
  pagadoRenta: number;
  pagadoIVA: number;
  pagadoMoratorio: number;
  totalRentaPendiente: number;
  totalMoratorioPendiente: number;
  totalAdeudado: number;
}

interface ApiResponse {
  contract: ContractInfo;
  schedule: ScheduleRow[];
  summary: Summary;
}

// ─── Helpers ────────────────────────────────────────────────────────

function clientName(c: ContractInfo['client']) {
  if (c.tipo === 'PM') return c.razonSocial || 'Sin nombre';
  return [c.nombre, c.apellidoPaterno].filter(Boolean).join(' ') || 'Sin nombre';
}

function estatusBadge(e: Estatus, dias: number) {
  if (e === 'PAGADO')
    return { color: '#059669', icon: <CheckCircle2 size={14} color="#059669" />, label: 'Pagado' };
  if (e === 'PARCIAL')
    return { color: '#D97706', icon: <AlertTriangle size={14} color="#D97706" />, label: `Parcial (${dias}d)` };
  if (e === 'VENCIDO')
    return { color: '#DC2626', icon: <XCircle size={14} color="#DC2626" />, label: `Vencido (${dias}d)` };
  if (e === 'PENDIENTE')
    return { color: '#0EA5E9', icon: <AlertTriangle size={14} color="#0EA5E9" />, label: 'Pendiente' };
  return { color: '#9CA3AF', icon: <span style={{ fontSize: 12 }}>·</span>, label: 'Futuro' };
}

function contratoEstatusBadge(estatus: string) {
  const s = (estatus || '').toUpperCase();
  if (s === 'VENCIDO') return { bg: '#FEE2E2', fg: '#B91C1C', label: 'Vencido' };
  if (s === 'PAGADO')  return { bg: '#D1FAE5', fg: '#065F46', label: 'Pagado' };
  if (s === 'CANCELADO') return { bg: '#E5E7EB', fg: '#374151', label: 'Cancelado' };
  return { bg: '#FFFBEB', fg: '#92400E', label: s || 'Vigente' };
}

// ─── Component ──────────────────────────────────────────────────────

export default function CobranzaContrato() {
  const { id } = useParams<{ id: string }>();
  const [data, setData] = useState<ApiResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [tab, setTab] = useState<'parcialidades' | 'auditoria'>('parcialidades');
  const [expandedRow, setExpandedRow] = useState<number | null>(null);

  useEffect(() => {
    if (!id) return;
    setLoading(true);
    api.get<ApiResponse>(`/cobranza/contract/${id}`)
      .then(res => setData(res.data))
      .catch(err => setError(err?.response?.data?.error || 'No se pudo cargar el contrato'))
      .finally(() => setLoading(false));
  }, [id]);

  // ── Cálculos derivados ──────────────────────────────────────
  const calc = useMemo(() => {
    if (!data) return null;
    const { schedule, summary, contract } = data;

    // Saldo insoluto = saldoFinal de la última fila no PAGADA (o última pagada)
    let saldoInsoluto = 0;
    const firstUnpaid = schedule.find(r => r.estatus !== 'PAGADO');
    if (firstUnpaid) {
      saldoInsoluto = firstUnpaid.saldoInicial;
    } else if (schedule.length) {
      saldoInsoluto = schedule[schedule.length - 1].saldoFinal;
    }

    // Saldo vencido = totalAdeudado de filas VENCIDAS o PARCIALES
    const saldoVencido = schedule
      .filter(r => r.estatus === 'VENCIDO' || r.estatus === 'PARCIAL')
      .reduce((s, r) => s + r.desglose.totalAdeudado, 0);

    // Abonado a capital = sum de pagoCapital de filas PAGADAS
    const abonadoCapital = schedule
      .filter(r => r.estatus === 'PAGADO')
      .reduce((s, r) => s + r.pagoCapital, 0);

    // Intereses ordinarios pagados = sum de intereses de filas PAGADAS
    const interesesOrdPagados = schedule
      .filter(r => r.estatus === 'PAGADO')
      .reduce((s, r) => s + r.intereses, 0);

    // Monto a liquidar (estimado):
    //   FINANCIERO: saldo insoluto + saldo vencido (incluye moratorios e IVA)
    //   PURO:       suma de rentas futuras pendientes + saldo vencido
    let montoLiquidar = 0;
    if (contract.producto === 'FINANCIERO') {
      montoLiquidar = saldoInsoluto + saldoVencido;
    } else {
      const rentasFuturas = schedule
        .filter(r => r.estatus === 'FUTURO' || r.estatus === 'PENDIENTE')
        .reduce((s, r) => s + r.pagoTotal, 0);
      montoLiquidar = rentasFuturas + saldoVencido;
    }

    return {
      saldoInsoluto,
      saldoVencido,
      abonadoCapital,
      interesesOrdPagados,
      interesesMorPagados: summary.pagadoMoratorio,
      montoLiquidar,
    };
  }, [data]);

  // ── Render ──────────────────────────────────────────────────
  if (loading) {
    return (
      <div style={{ padding: 40, textAlign: 'center' }}>
        <div className="animate-spin rounded-full h-6 w-6 border-2 border-inyecta-600 border-t-transparent mx-auto" />
        <p style={{ marginTop: 10, fontSize: 12, color: '#6B7280' }}>Cargando contrato...</p>
      </div>
    );
  }
  if (error || !data || !calc) {
    return (
      <div style={{ padding: 24 }}>
        <Link to="/cobranza" style={{ display: 'inline-flex', alignItems: 'center', gap: 6, color: '#184892', textDecoration: 'none', fontSize: 12 }}>
          <ArrowLeft size={14} /> Volver a Cobranza
        </Link>
        <div style={{ marginTop: 12, padding: 16, background: '#FEE2E2', border: '1px solid #FCA5A5', borderRadius: 8, color: '#991B1B' }}>
          {error || 'Contrato no encontrado'}
        </div>
      </div>
    );
  }

  const { contract, schedule, summary } = data;
  const cBadge = contratoEstatusBadge(contract.estatus);
  const fechaCorte = new Date().toLocaleDateString('es-MX', { day: 'numeric', month: 'long', year: 'numeric' });

  return (
    <div style={{ fontFamily: "'Roboto', sans-serif" }}>
      {/* Breadcrumb */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
        <Link
          to="/cobranza"
          style={{ display: 'inline-flex', alignItems: 'center', gap: 6, color: '#184892', textDecoration: 'none', fontSize: 12 }}
        >
          <ArrowLeft size={14} /> Volver a Cobranza
        </Link>
        <div style={{ fontSize: 13, fontWeight: 600, color: '#184892' }}>
          Cálculo hasta el {fechaCorte}
        </div>
      </div>

      {/* Header card del contrato (estilo legacy) */}
      <div style={{ background: '#FFF', border: '1px solid #E5E7EB', borderRadius: 6, padding: 14, marginBottom: 14 }}>
        <div style={{ fontSize: 13, fontWeight: 700, color: '#111827', marginBottom: 8 }}>Cobranza · {contract.folio}</div>
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))',
            gap: 12,
            fontSize: 12,
          }}
        >
          <Stat label="No. Crédito"     value={contract.folio} mono />
          <Stat label="RFC"             value={contract.client.rfc || '—'} mono />
          <Stat
            label="Cliente"
            value={
              <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                {contract.client.tipo === 'PM'
                  ? <Building2 size={11} style={{ color: '#9CA3AF' }} />
                  : <UserIcon  size={11} style={{ color: '#9CA3AF' }} />}
                <Link
                  to={`/clientes/${contract.client.id}`}
                  style={{ color: '#184892', textDecoration: 'none' }}
                >
                  {clientName(contract.client)}
                </Link>
              </span>
            }
          />
          <Stat label="Producto"        value={contract.producto === 'PURO' ? 'Arrendamiento Puro' : 'Arrendamiento Financiero'} />
          <Stat label="Crédito Otorgado" value={formatCurrency(contract.montoFinanciar)} />
          <Stat label="Mensualidades"   value={String(contract.plazo)} />
          <Stat label="Tasa Anual"      value={`${(Number(contract.tasaAnual) * 100).toFixed(2)}%`} />
          <Stat label="Tasa Moratoria"  value={`${(Number(contract.tasaMoratoria || contract.tasaAnual * 2) * 100).toFixed(2)}% anual`} />
          <Stat
            label="Estatus"
            value={
              <span style={{
                display: 'inline-block', padding: '2px 8px', borderRadius: 4,
                background: cBadge.bg, color: cBadge.fg, fontWeight: 600, fontSize: 11,
              }}>
                {cBadge.label}
              </span>
            }
          />
        </div>
      </div>

      {/* Tabs */}
      <div style={{ borderBottom: '1px solid #E5E7EB', marginBottom: 12, display: 'flex', gap: 0 }}>
        <TabButton active={tab === 'parcialidades'} onClick={() => setTab('parcialidades')}>
          <Calculator size={14} /> Parcialidades
        </TabButton>
        <TabButton active={tab === 'auditoria'} onClick={() => setTab('auditoria')}>
          <CreditCard size={14} /> Auditoría de Pagos
        </TabButton>
      </div>

      {/* ─── Tab: Parcialidades ─── */}
      {tab === 'parcialidades' && (
        <>
          <div style={{ background: '#FFF', border: '1px solid #E5E7EB', borderRadius: 6, overflow: 'hidden' }}>
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', fontSize: 12, borderCollapse: 'collapse', minWidth: 900 }}>
                <thead>
                  <tr style={{ background: '#112239', color: '#FFF' }}>
                    <th style={th(40)}>#</th>
                    <th style={th(40, 'left')}>Periodo</th>
                    <th style={th(80, 'center')}>Fecha</th>
                    <th style={th(90, 'right')}>Capital</th>
                    <th style={th(90, 'right')}>Intereses</th>
                    <th style={th(60, 'right')}>Seguro</th>
                    <th style={th(100, 'right')}>Moratorios</th>
                    <th style={th(90, 'right')}>Abonos</th>
                    <th style={th(100, 'right')}>Pago Total</th>
                    <th style={th(70, 'center')}>Pagado</th>
                  </tr>
                </thead>
                <tbody>
                  {schedule.map(row => {
                    const badge = estatusBadge(row.estatus, row.diasAtraso);
                    const expanded = expandedRow === row.periodo;
                    const moratorioTotal = row.moratorio.generado + row.moratorio.ivaGenerado;
                    return (
                      <>
                        <tr
                          key={row.periodo}
                          style={{
                            borderBottom: '1px solid #F3F4F6',
                            background: expanded ? '#F9FAFB' : 'transparent',
                            cursor: row.pagos.cantidad > 0 || moratorioTotal > 0 ? 'pointer' : 'default',
                          }}
                          onClick={() => {
                            if (row.pagos.cantidad > 0 || moratorioTotal > 0) {
                              setExpandedRow(expanded ? null : row.periodo);
                            }
                          }}
                        >
                          <td style={td('center', 32)}>
                            {(row.pagos.cantidad > 0 || moratorioTotal > 0) && (
                              expanded ? <ChevronDown size={12} /> : <ChevronRight size={12} />
                            )}
                          </td>
                          <td style={td('left')}>{row.periodo}</td>
                          <td style={td('center')}>{formatDate(row.fechaPago)}</td>
                          <td style={td('right')}>{formatCurrency(row.pagoCapital)}</td>
                          <td style={td('right')}>{formatCurrency(row.intereses)}</td>
                          <td style={td('right', undefined, '#9CA3AF')}>{formatCurrency(0)}</td>
                          <td style={td('right', undefined, moratorioTotal > 0 ? '#DC2626' : '#9CA3AF')}>
                            {formatCurrency(moratorioTotal)}
                            {row.moratorio.pendiente > 0 && (
                              <div style={{ fontSize: 10, color: '#DC2626' }}>
                                Pend: {formatCurrency(row.moratorio.pendiente + row.moratorio.ivaPendiente)}
                              </div>
                            )}
                          </td>
                          <td style={td('right', undefined, row.pagos.totalPagado > 0 ? '#059669' : '#9CA3AF')}>
                            {row.pagos.totalPagado > 0 ? formatCurrency(row.pagos.totalPagado) : '—'}
                          </td>
                          <td style={{ ...td('right'), fontWeight: 600 }}>
                            {formatCurrency(row.pagoTotal + moratorioTotal)}
                          </td>
                          <td style={{ ...td('center'), display: 'table-cell' }}>
                            <span title={badge.label} style={{ display: 'inline-flex', alignItems: 'center', gap: 4, color: badge.color, fontSize: 11, fontWeight: 600 }}>
                              {badge.icon}
                              {row.diasAtraso > 0 && row.estatus !== 'PAGADO' && (
                                <span style={{ fontSize: 10 }}>{row.diasAtraso}d</span>
                              )}
                            </span>
                          </td>
                        </tr>
                        {expanded && (
                          <tr style={{ background: '#F9FAFB' }}>
                            <td colSpan={10} style={{ padding: 12 }}>
                              <ExpandedRow row={row} />
                            </td>
                          </tr>
                        )}
                      </>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>

          {/* Saldo Vencido + Monto a Liquidar + botón */}
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: '1fr auto',
              gap: 16,
              alignItems: 'center',
              marginTop: 18,
              padding: 16,
              background: '#FFF',
              border: '1px solid #E5E7EB',
              borderRadius: 6,
            }}
          >
            <div>
              <div style={{ fontSize: 14, fontWeight: 700, color: '#184892' }}>
                Saldo Vencido: {formatCurrency(calc.saldoVencido)}
              </div>
              <div style={{ fontSize: 16, fontWeight: 700, color: '#184892', marginTop: 4 }}>
                Monto a Liquidar: <span style={{ fontSize: 18 }}>{formatCurrency(calc.montoLiquidar)}</span>
              </div>
              <div style={{ fontSize: 10, color: '#9CA3AF', marginTop: 2 }}>
                * Estimación calculada sobre saldo insoluto + adeudo vigente. La fórmula
                exacta de liquidación anticipada se confirmará por el área de cobranza.
              </div>
            </div>
            <button
              disabled
              title="Próximamente — requiere endpoint de liquidación anticipada"
              style={{
                background: '#112239',
                color: '#FFF',
                border: 'none',
                padding: '10px 18px',
                borderRadius: 4,
                fontSize: 13,
                fontWeight: 600,
                cursor: 'not-allowed',
                opacity: 0.85,
                fontFamily: "'Roboto', sans-serif",
                display: 'inline-flex',
                alignItems: 'center',
                gap: 6,
              }}
            >
              $ Liquidar Crédito
            </button>
          </div>

          {/* Resumen (estilo legacy: tabla pequeña con borde) */}
          <div style={{ marginTop: 18, display: 'flex', justifyContent: 'flex-end' }}>
            <table style={{ borderCollapse: 'collapse', fontSize: 11, fontFamily: "'Roboto', sans-serif" }}>
              <thead>
                <tr>
                  <th colSpan={5} style={{ background: '#FFF', border: '1px solid #D1D5DB', padding: '6px 10px', textAlign: 'center', fontWeight: 700, color: '#111827' }}>
                    RESUMEN
                  </th>
                </tr>
                <tr style={{ background: '#F3F4F6' }}>
                  <th style={resumenTh}>Crédito Otorgado</th>
                  <th style={resumenTh}>Abonado a Capital</th>
                  <th style={resumenTh}>Saldo Insoluto</th>
                  <th style={resumenTh}>Intereses Ordinarios Pagados</th>
                  <th style={resumenTh}>Intereses Moratorios Pagados</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td style={resumenTd}>{formatCurrency(contract.montoFinanciar)}</td>
                  <td style={resumenTd}>{formatCurrency(calc.abonadoCapital)}</td>
                  <td style={resumenTd}>{formatCurrency(calc.saldoInsoluto)}</td>
                  <td style={resumenTd}>{formatCurrency(calc.interesesOrdPagados)}</td>
                  <td style={resumenTd}>{formatCurrency(calc.interesesMorPagados)}</td>
                </tr>
              </tbody>
            </table>
          </div>

          {/* Stats agregados (atrasados, pagados, etc.) */}
          <div
            style={{
              marginTop: 18,
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))',
              gap: 10,
            }}
          >
            <MiniStat label="Períodos pagados"   value={summary.pagados} total={summary.totalPeriodos} color="#059669" />
            <MiniStat label="Períodos vencidos"  value={summary.vencidos} total={summary.totalPeriodos} color="#DC2626" />
            <MiniStat label="Períodos parciales" value={summary.parciales} total={summary.totalPeriodos} color="#D97706" />
            <MiniStat label="Períodos por pagar" value={summary.pendientes} total={summary.totalPeriodos} color="#0EA5E9" />
            <MiniStat label="Total pagado"  value={formatCurrency(summary.totalPagado)} color="#059669" />
            <MiniStat label="Adeudado total" value={formatCurrency(summary.totalAdeudado)} color="#184892" />
          </div>
        </>
      )}

      {/* ─── Tab: Auditoría ─── */}
      {tab === 'auditoria' && (
        <div style={{ background: '#FFF', border: '1px solid #E5E7EB', borderRadius: 6, padding: 14 }}>
          <div style={{ fontSize: 12, color: '#6B7280', marginBottom: 10 }}>
            Listado completo de pagos registrados (en orden cronológico).
          </div>
          <table style={{ width: '100%', fontSize: 12, borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ background: '#112239', color: '#FFF' }}>
                <th style={th(50, 'center')}>P</th>
                <th style={th(80, 'center')}>Fecha</th>
                <th style={th(90, 'right')}>Renta</th>
                <th style={th(70, 'right')}>IVA</th>
                <th style={th(90, 'right')}>Moratorio</th>
                <th style={th(70, 'right')}>IVA Mor.</th>
                <th style={th(100, 'right')}>Total</th>
                <th style={th(120, 'left')}>Referencia</th>
              </tr>
            </thead>
            <tbody>
              {schedule.flatMap(row => row.pagos.detalle.map((p) => ({ ...p, periodo: row.periodo, row })))
                .sort((a, b) => new Date(a.fecha).getTime() - new Date(b.fecha).getTime())
                .map((p) => (
                  <tr key={p.id} style={{ borderBottom: '1px solid #F3F4F6' }}>
                    <td style={td('center')}>{p.periodo}</td>
                    <td style={td('center')}>{formatDate(p.fecha)}</td>
                    <td style={td('right')}>{formatCurrency(p.row.pagos.pagadoRenta)}</td>
                    <td style={td('right')}>{formatCurrency(p.row.pagos.pagadoIVA)}</td>
                    <td style={td('right', undefined, p.row.pagos.pagadoMoratorio > 0 ? '#DC2626' : '#9CA3AF')}>
                      {formatCurrency(p.row.pagos.pagadoMoratorio)}
                    </td>
                    <td style={td('right', undefined, p.row.pagos.pagadoIVAMoratorio > 0 ? '#DC2626' : '#9CA3AF')}>
                      {formatCurrency(p.row.pagos.pagadoIVAMoratorio)}
                    </td>
                    <td style={{ ...td('right'), fontWeight: 600, color: '#059669' }}>{formatCurrency(p.monto)}</td>
                    <td style={td('left', undefined, '#6B7280')}>{p.referencia || '—'}</td>
                  </tr>
                ))}
              {schedule.every(r => r.pagos.cantidad === 0) && (
                <tr>
                  <td colSpan={8} style={{ padding: 24, textAlign: 'center', color: '#9CA3AF' }}>
                    Aún no se registran pagos para este contrato.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// ─── Sub-componentes ────────────────────────────────────────────────

function Stat({ label, value, mono }: { label: string; value: React.ReactNode; mono?: boolean }) {
  return (
    <div>
      <div style={{ fontSize: 10, color: '#6B7280', textTransform: 'uppercase', letterSpacing: 0.4, marginBottom: 2 }}>
        {label}
      </div>
      <div style={{ fontSize: 12, fontWeight: 600, color: '#111827', fontFamily: mono ? "'Roboto Mono', monospace" : 'inherit' }}>
        {value}
      </div>
    </div>
  );
}

function MiniStat({ label, value, total, color }: {
  label: string; value: string | number; total?: number; color: string;
}) {
  return (
    <div style={{ background: '#FFF', border: '1px solid #E5E7EB', borderRadius: 6, padding: 10 }}>
      <div style={{ fontSize: 10, color: '#6B7280', textTransform: 'uppercase', letterSpacing: 0.4 }}>{label}</div>
      <div style={{ fontSize: 16, fontWeight: 700, color, marginTop: 2 }}>
        {value}{total !== undefined && <span style={{ fontSize: 11, color: '#9CA3AF', marginLeft: 4 }}>/ {total}</span>}
      </div>
    </div>
  );
}

function TabButton({ active, onClick, children }: {
  active: boolean; onClick: () => void; children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      style={{
        background: active ? '#FFF' : 'transparent',
        border: '1px solid ' + (active ? '#E5E7EB' : 'transparent'),
        borderBottom: active ? '1px solid #FFF' : '1px solid transparent',
        marginBottom: -1,
        padding: '8px 16px',
        fontSize: 13,
        fontWeight: 600,
        color: active ? '#184892' : '#6B7280',
        cursor: 'pointer',
        display: 'inline-flex',
        alignItems: 'center',
        gap: 6,
        borderRadius: '4px 4px 0 0',
        fontFamily: "'Roboto', sans-serif",
      }}
    >
      {children}
    </button>
  );
}

function ExpandedRow({ row }: { row: ScheduleRow }) {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 14 }}>
      {row.moratorio.generado > 0 && (
        <div style={cellBox}>
          <div style={cellTitle}>Moratorios del periodo ({row.diasAtraso} días)</div>
          <KV k="Generado"      v={formatCurrency(row.moratorio.generado)} />
          <KV k="IVA generado"  v={formatCurrency(row.moratorio.ivaGenerado)} />
          <KV k="Pagado"        v={formatCurrency(row.moratorio.pagado + row.moratorio.ivaPagado)} good />
          <KV k="Pendiente"     v={formatCurrency(row.moratorio.pendiente + row.moratorio.ivaPendiente)} bad />
        </div>
      )}
      <div style={cellBox}>
        <div style={cellTitle}>Saldo del periodo</div>
        <KV k="Saldo inicial"   v={formatCurrency(row.saldoInicial)} />
        <KV k="Capital"         v={formatCurrency(row.pagoCapital)} />
        <KV k="Interés"         v={formatCurrency(row.intereses)} />
        <KV k="Saldo final"     v={formatCurrency(row.saldoFinal)} />
      </div>
      {row.pagos.detalle.length > 0 && (
        <div style={cellBox}>
          <div style={cellTitle}>Pagos aplicados ({row.pagos.detalle.length})</div>
          {row.pagos.detalle.map(p => (
            <div key={p.id} style={{ fontSize: 11, color: '#374151', marginBottom: 3 }}>
              {formatDate(p.fecha)} · <strong>{formatCurrency(p.monto)}</strong>
              {p.referencia && <span style={{ color: '#9CA3AF' }}> · {p.referencia}</span>}
            </div>
          ))}
        </div>
      )}
      {row.pagos.detalle.length === 0 && (row.estatus === 'VENCIDO' || row.estatus === 'PARCIAL') && (
        <div style={cellBox}>
          <div style={cellTitle}>Adeudo del periodo</div>
          <KV k="Renta + IVA"     v={formatCurrency(row.desglose.rentaTotalPendiente)} />
          <KV k="Moratorio + IVA" v={formatCurrency(row.desglose.moratorioPendiente + row.desglose.ivaMoratorioPendiente)} bad />
          <KV k="Total adeudado"  v={formatCurrency(row.desglose.totalAdeudado)} bad bold />
        </div>
      )}
    </div>
  );
}

function KV({ k, v, good, bad, bold }: { k: string; v: string; good?: boolean; bad?: boolean; bold?: boolean }) {
  return (
    <div style={{
      display: 'flex', justifyContent: 'space-between', fontSize: 11,
      color: bad ? '#DC2626' : good ? '#059669' : '#374151',
      marginBottom: 2,
      fontWeight: bold ? 700 : 400,
    }}>
      <span style={{ color: bad ? '#DC2626' : good ? '#059669' : '#6B7280' }}>{k}</span>
      <span>{v}</span>
    </div>
  );
}

// ─── Style helpers ───────────────────────────────────────────────────

function th(width: number, align: 'left' | 'center' | 'right' = 'center') {
  return {
    padding: '8px 10px',
    textAlign: align,
    fontWeight: 600,
    fontSize: 11,
    width,
    fontFamily: "'Roboto', sans-serif",
    letterSpacing: 0.3,
  } as const;
}

function td(align: 'left' | 'center' | 'right' = 'left', width?: number, color?: string) {
  return {
    padding: '7px 10px',
    textAlign: align,
    width,
    color: color ?? '#111827',
    fontFamily: "'Roboto', sans-serif",
    fontSize: 12,
  } as const;
}

const cellBox: React.CSSProperties = {
  background: '#FFF',
  border: '1px solid #E5E7EB',
  borderRadius: 6,
  padding: 10,
};

const cellTitle: React.CSSProperties = {
  fontSize: 10,
  fontWeight: 700,
  color: '#184892',
  textTransform: 'uppercase',
  letterSpacing: 0.5,
  marginBottom: 6,
};

const resumenTh: React.CSSProperties = {
  border: '1px solid #D1D5DB',
  padding: '6px 12px',
  fontWeight: 600,
  fontSize: 11,
  textAlign: 'center',
  color: '#374151',
};

const resumenTd: React.CSSProperties = {
  border: '1px solid #D1D5DB',
  padding: '8px 12px',
  textAlign: 'right',
  fontWeight: 600,
  fontSize: 12,
  color: '#111827',
};
