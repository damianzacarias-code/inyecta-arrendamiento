import { useState, useEffect, useMemo, useCallback } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { PDFDownloadLink } from '@react-pdf/renderer';
import api from '@/lib/api';
import LoadErrorState, { describeApiError } from '@/components/LoadErrorState';
import { formatCurrency, formatPercent, formatDate } from '@/lib/utils';
import {
  ArrowLeft,
  FileText,
  Table as TableIcon,
  Printer,
  CheckCircle2,
  XCircle,
  FolderPlus,
  AlertTriangle,
  Clock,
} from 'lucide-react';
import { calcularCotizacion } from '@/lib/cotizacion/calculos';
import { calcAmortPuro, calcAmortFinanciero } from '@/lib/cotizacion/amortizacion';
import { CotizacionPDF } from '@/lib/pdf/CotizacionPDF';
import { AmortizacionPDF } from '@/lib/pdf/AmortizacionPDF';
import { useBranding } from '@/lib/branding';

interface QuotationDetail {
  id: string;
  folio: string;
  nombreCliente: string;
  producto: string;
  valorBien: number;
  valorBienIVA: number;
  plazo: number;
  tasaAnual: number;
  nivelRiesgo: string;
  enganche: number;
  enganchePorcentaje: number;
  depositoGarantia: number;
  depositoGarantiaPct: number;
  comisionApertura: number;
  comisionAperturaPct: number;
  comisionAperturaFinanciada: boolean;
  rentaInicial: number;
  gpsInstalacion: number;
  gpsFinanciado: boolean;
  seguroAnual: number;
  seguroFinanciado: boolean;
  /** §4.14: si true, el seguro está pendiente de cotizar */
  seguroPendiente?: boolean;
  valorResidual: number;
  valorResidualPct: number;
  /** §4.13: solo PURO — si true, residual = comisión apertura */
  valorResidualEsComision?: boolean;
  montoFinanciar: number;
  rentaMensual: number;
  rentaMensualIVA: number;
  totalRentas: number;
  totalPagar: number;
  ganancia: number;
  estado: string;
  vigenciaHasta: string;
  observaciones?: string;
  // Datos del bien (espejo del modelo Prisma `Quotation`).
  // El backend ya los retorna; la interfaz los omitía.
  bienDescripcion?: string | null;
  bienMarca?: string | null;
  bienModelo?: string | null;
  bienAnio?: number | null;
  bienNuevo?: boolean;
  createdAt: string;
  clientId?: string | null;
  user?: { nombre: string; apellidos: string; email: string };
  client?: { rfc: string; tipo: string };
  contrato?: { id: string; folio: string; etapa?: string; estatus?: string } | null;
  opciones?: Array<{
    nombre: string;
    producto: string;
    nivelRiesgo: string;
    enganche: number;
    depositoGarantia: number;
    rentaMensualIVA: number;
    valorResidual: number;
    totalPagar: number;
    ganancia: number;
  }>;
  amortizacion?: Array<{
    periodo: number;
    saldoInicial: number;
    pagoCapital: number;
    intereses: number;
    renta: number;
    iva: number;
    seguro: number;
    pagoTotal: number;
    saldoFinal: number;
  }>;
}

const estadoBadgeColors: Record<string, string> = {
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

export default function CotizacionDetalle() {
  const { id } = useParams();
  const navigate = useNavigate();
  const branding = useBranding();
  const [quotation, setQuotation] = useState<QuotationDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [actionError, setActionError] = useState('');

  const reload = useCallback(() => {
    setLoading(true);
    setLoadError(null);
    api.get(`/quotations/${id}`)
      .then((res) => setQuotation(res.data))
      .catch((err) => setLoadError(describeApiError(err)))
      .finally(() => setLoading(false));
  }, [id]);

  useEffect(() => {
    reload();
  }, [reload]);

  const handleEstado = async (estado: 'APROBADA' | 'RECHAZADA') => {
    if (!quotation) return;
    const confirmMsg =
      estado === 'RECHAZADA'
        ? '¿Marcar esta cotización como RECHAZADA? Esta acción no se puede revertir.'
        : '¿Marcar esta cotización como APROBADA?';
    if (!window.confirm(confirmMsg)) return;
    setActionLoading(estado);
    setActionError('');
    try {
      const res = await api.patch(`/quotations/${quotation.id}/estado`, { estado });
      setQuotation({ ...quotation, ...res.data });
    } catch (err: any) {
      const msg = err.response?.data?.error;
      setActionError(typeof msg === 'string' ? msg : 'Error al actualizar estado');
    } finally {
      setActionLoading(null);
    }
  };

  const handleConvert = async () => {
    if (!quotation) return;
    if (!quotation.clientId) {
      // No hay cliente registrado: abrir el wizard de contrato manual con prefill
      navigate(`/contratos/nuevo?quotationId=${quotation.id}`);
      return;
    }
    if (!window.confirm(`¿Crear contrato a partir de la cotización ${quotation.folio}?`)) return;
    setActionLoading('CONVERT');
    setActionError('');
    try {
      const res = await api.post(`/quotations/${quotation.id}/convert`);
      navigate(`/contratos/${res.data.id}`);
    } catch (err: any) {
      const msg = err.response?.data?.error;
      const contratoId = err.response?.data?.contratoId;
      if (contratoId) {
        navigate(`/contratos/${contratoId}`);
        return;
      }
      setActionError(typeof msg === 'string' ? msg : 'Error al convertir');
    } finally {
      setActionLoading(null);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="animate-spin rounded-full h-8 w-8 border-2 border-inyecta-600 border-t-transparent" />
      </div>
    );
  }

  if (loadError) {
    return (
      <LoadErrorState
        title="No se pudo cargar la cotización"
        error={loadError}
        onRetry={reload}
      />
    );
  }

  if (!quotation) {
    return (
      <div className="text-center py-20">
        <p className="text-gray-500">Cotizacion no encontrada</p>
        <Link to="/cotizaciones" className="text-inyecta-600 hover:underline text-sm mt-2 inline-block">
          Volver a cotizaciones
        </Link>
      </div>
    );
  }

  const q = quotation;
  const canConvert = q.estado === 'VIGENTE' || q.estado === 'APROBADA';
  const canMarkApproved = q.estado === 'VIGENTE';
  const canReject = q.estado === 'VIGENTE' || q.estado === 'APROBADA';
  const badgeClass = estadoBadgeColors[q.estado] || 'bg-gray-100 text-gray-700 border-gray-200';

  // ── PDFs (cotización + amortización) ────────────────────────────
  // Reconstruimos los inputs canónicos a partir de los campos guardados
  // y los pasamos por el motor verificado al centavo
  // (lib/cotizacion/*). El servidor ya conserva los parámetros — aquí
  // sólo derivamos lo que el PDF necesita y nada más.
  const pdfData = useMemo(() => {
    const valorBien = Number(q.valorBien);
    const valorBienConIVA = Number(q.valorBienIVA) || valorBien * 1.16;
    const tasaAnual = Number(q.tasaAnual);
    const nombreBien =
      q.bienDescripcion ||
      [q.bienMarca, q.bienModelo, q.bienAnio].filter(Boolean).join(' ') ||
      'Bien arrendado';
    const enganchePct = Number(q.enganchePorcentaje);

    const cotData = calcularCotizacion({
      valorBienConIVA,
      tasaIVA: 0.16,
      producto: q.producto as 'PURO' | 'FINANCIERO',
      plazo: q.plazo,
      tasaAnual,
      tasaComisionApertura: Number(q.comisionAperturaPct),
      comisionAperturaEsContado: !q.comisionAperturaFinanciada,
      // §4.12: depósito y residual son conceptos separados.
      // El schema persiste ambos por separado desde el commit que
      // separó depositoGarantia de valorResidual; aquí los usamos
      // tal cual de la BD.
      porcentajeDeposito: Number(q.depositoGarantiaPct ?? q.valorResidualPct),
      valorResidual: Number(q.valorResidualPct),
      valorResidualEsComision: Boolean(q.valorResidualEsComision),
      gpsMonto: Number(q.gpsInstalacion),
      gpsEsContado: !q.gpsFinanciado,
      seguroAnual: Number(q.seguroAnual),
      seguroPendiente: Boolean(q.seguroPendiente),
      seguroEsContado: !q.seguroFinanciado,
      // El esquema actual no persiste si el enganche fue de contado;
      // asumimos contado (default histórico) y sólo lo aplicamos si > 0.
      // §4.2: enganche se resta de B17 sobre valorSinIVA (no conIVA).
      engancheMonto: valorBien * enganchePct,
      engancheEsContado: true,
      nombreBien,
      estadoBien: q.bienNuevo === false ? 'Seminuevo' : 'Nuevo',
      seguroEstado: q.seguroFinanciado ? 'Contratado' : 'Pendiente',
      nombreCliente: q.nombreCliente || 'Sin nombre',
      fecha: new Date(q.createdAt),
    });

    // Para la amortización usamos createdAt + 1 mes como aproximación de
    // fecha de primer pago (el esquema de cotización aún no la persiste).
    const base = new Date(q.createdAt);
    const fechaPrimerPago = new Date(
      base.getFullYear(),
      base.getMonth() + 1,
      base.getDate(),
      12, 0, 0,
    );

    const filasPuro =
      q.producto === 'PURO'
        ? calcAmortPuro(cotData.rentaMensual.montoNeto, q.plazo, fechaPrimerPago)
        : undefined;

    const filasFinanciero =
      q.producto === 'FINANCIERO'
        ? calcAmortFinanciero(
            cotData.montoFinanciadoReal,
            tasaAnual,
            q.plazo,
            cotData.fvAmortizacion,
            fechaPrimerPago,
          )
        : undefined;

    return { cotData, tasaAnual, filasPuro, filasFinanciero };
  }, [q]);

  /** Slug seguro para nombres de archivo */
  const fileSlug = (q.folio || q.nombreCliente || 'cotizacion')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 40) || 'cotizacion';

  return (
    <div className="max-w-4xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-3">
          <Link to="/cotizaciones" className="text-gray-400 hover:text-gray-600">
            <ArrowLeft size={20} />
          </Link>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-2xl font-bold text-gray-900">{q.folio}</h1>
              <span className={`text-xs font-medium px-2 py-0.5 rounded border ${badgeClass}`}>
                {estadoLabels[q.estado] || q.estado}
              </span>
            </div>
            <p className="text-gray-500 text-sm">{q.nombreCliente} | {formatDate(q.createdAt)}</p>
          </div>
        </div>
        <div className="flex flex-wrap gap-2 print:hidden">
          {canConvert && (
            <button
              onClick={handleConvert}
              disabled={!!actionLoading}
              className="flex items-center gap-1.5 px-3 py-2 bg-violet-600 hover:bg-violet-700 disabled:bg-violet-300 rounded-lg text-sm text-white font-medium shadow-sm"
            >
              <FolderPlus size={14} />
              {actionLoading === 'CONVERT' ? 'Convirtiendo...' : 'Crear Contrato'}
            </button>
          )}
          {canMarkApproved && (
            <button
              onClick={() => handleEstado('APROBADA')}
              disabled={!!actionLoading}
              className="flex items-center gap-1.5 px-3 py-2 border border-blue-300 text-blue-700 hover:bg-blue-50 rounded-lg text-sm font-medium"
            >
              <CheckCircle2 size={14} />
              {actionLoading === 'APROBADA' ? '...' : 'Aprobar'}
            </button>
          )}
          {canReject && (
            <button
              onClick={() => handleEstado('RECHAZADA')}
              disabled={!!actionLoading}
              className="flex items-center gap-1.5 px-3 py-2 border border-red-300 text-red-700 hover:bg-red-50 rounded-lg text-sm font-medium"
            >
              <XCircle size={14} />
              {actionLoading === 'RECHAZADA' ? '...' : 'Rechazar'}
            </button>
          )}
          <button
            onClick={() => window.print()}
            className="flex items-center gap-1.5 px-3 py-2 border border-gray-300 rounded-lg text-sm text-gray-700 hover:bg-gray-50"
          >
            <Printer size={14} /> Imprimir
          </button>
          <PDFDownloadLink
            document={<CotizacionPDF data={pdfData.cotData} tasaAnual={pdfData.tasaAnual} folio={q.folio} />}
            fileName={`cotizacion-${fileSlug}.pdf`}
            className="flex items-center gap-1.5 px-3 py-2 bg-inyecta-700 hover:bg-inyecta-800 rounded-lg text-sm text-white font-medium shadow-sm"
          >
            {({ loading: pdfLoading }) => (
              <>
                <FileText size={14} />
                {pdfLoading ? 'Generando…' : 'Descargar Cotización'}
              </>
            )}
          </PDFDownloadLink>
          <PDFDownloadLink
            document={
              <AmortizacionPDF
                data={pdfData.cotData}
                tasaAnual={pdfData.tasaAnual}
                filasPuro={pdfData.filasPuro}
                filasFinanciero={pdfData.filasFinanciero}
              />
            }
            fileName={`amortizacion-${fileSlug}.pdf`}
            className="flex items-center gap-1.5 px-3 py-2 bg-accent hover:bg-accent-dark rounded-lg text-sm text-white font-medium shadow-sm"
          >
            {({ loading: pdfLoading }) => (
              <>
                <TableIcon size={14} />
                {pdfLoading ? 'Generando…' : 'Descargar Amortización'}
              </>
            )}
          </PDFDownloadLink>
        </div>
      </div>

      {/* Banners de estado */}
      {actionError && (
        <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg text-sm mb-4 print:hidden">
          {actionError}
        </div>
      )}
      {q.estado === 'VENCIDA' && (
        <div className="bg-amber-50 border border-amber-200 text-amber-800 px-4 py-3 rounded-lg text-sm mb-4 flex items-start gap-2 print:hidden">
          <AlertTriangle size={16} className="mt-0.5 flex-shrink-0" />
          <div>
            <strong>Cotización vencida.</strong> La vigencia expiró el {formatDate(q.vigenciaHasta)}. Genera una
            nueva cotización si el cliente quiere continuar.
          </div>
        </div>
      )}
      {q.estado === 'VIGENTE' && q.vigenciaHasta && (() => {
        const dias = Math.ceil((new Date(q.vigenciaHasta).getTime() - Date.now()) / (1000 * 60 * 60 * 24));
        if (dias > 0 && dias <= 7) {
          return (
            <div className="bg-amber-50 border border-amber-200 text-amber-800 px-4 py-3 rounded-lg text-sm mb-4 flex items-start gap-2 print:hidden">
              <Clock size={16} className="mt-0.5 flex-shrink-0" />
              <div>
                <strong>Por vencer.</strong> Esta cotización vence en {dias} {dias === 1 ? 'día' : 'días'}
                ({formatDate(q.vigenciaHasta)}).
              </div>
            </div>
          );
        }
        return null;
      })()}
      {q.estado === 'CONVERTIDA' && q.contrato && (
        <div className="bg-violet-50 border border-violet-200 text-violet-800 px-4 py-3 rounded-lg text-sm mb-4 flex items-start gap-2 print:hidden">
          <CheckCircle2 size={16} className="mt-0.5 flex-shrink-0" />
          <div className="flex-1">
            <strong>Convertida en contrato.</strong> Esta cotización generó el contrato{' '}
            <Link to={`/contratos/${q.contrato.id}`} className="font-mono font-medium underline">
              {q.contrato.folio}
            </Link>
            .
          </div>
        </div>
      )}
      {q.estado === 'RECHAZADA' && (
        <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg text-sm mb-4 flex items-start gap-2 print:hidden">
          <XCircle size={16} className="mt-0.5 flex-shrink-0" />
          <div>
            <strong>Cotización rechazada.</strong> Esta cotización fue marcada como rechazada y no puede convertirse en contrato.
          </div>
        </div>
      )}

      {/* Print-optimized content */}
      <div className="print:p-0" id="quotation-print">
        {/* Summary cards */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
          <SummaryCard label="Producto" value={q.producto === 'PURO' ? 'Puro' : 'Financiero'} />
          <SummaryCard label="Valor del Bien" value={formatCurrency(Number(q.valorBien))} />
          <SummaryCard label="Renta Mensual + IVA" value={formatCurrency(Number(q.rentaMensualIVA))} highlight />
          <SummaryCard label="Plazo" value={`${q.plazo} meses`} />
        </div>

        {/* Financial details */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
          <div className="bg-white rounded-xl border border-gray-200 p-6">
            <h3 className="font-semibold text-gray-900 mb-4">Parametros</h3>
            <div className="space-y-2.5">
              <DetailRow label="Tasa Anual" value={formatPercent(Number(q.tasaAnual))} />
              <DetailRow label="Nivel de Riesgo" value={q.nivelRiesgo} />
              <DetailRow label="Enganche" value={`${formatCurrency(Number(q.enganche))} (${(Number(q.enganchePorcentaje) * 100).toFixed(0)}%)`} />
              <DetailRow label="Deposito Garantia" value={`${formatCurrency(Number(q.depositoGarantia))} (${(Number(q.depositoGarantiaPct) * 100).toFixed(0)}%)`} />
              <DetailRow label="Comision Apertura" value={`${formatCurrency(Number(q.comisionApertura))} (${(Number(q.comisionAperturaPct) * 100).toFixed(0)}%)`} />
              <DetailRow label="Valor Residual" value={`${formatCurrency(Number(q.valorResidual))} (${(Number(q.valorResidualPct) * 100).toFixed(0)}%)`} />
              <DetailRow label="GPS" value={`${formatCurrency(Number(q.gpsInstalacion))} ${q.gpsFinanciado ? '(financiado)' : ''}`} />
            </div>
          </div>

          <div className="bg-white rounded-xl border border-gray-200 p-6">
            <h3 className="font-semibold text-gray-900 mb-4">Resumen Financiero</h3>
            <div className="space-y-2.5">
              <DetailRow label="Valor + IVA" value={formatCurrency(Number(q.valorBienIVA))} />
              <DetailRow label="Monto a Financiar" value={formatCurrency(Number(q.montoFinanciar))} />
              <DetailRow label="Renta Mensual" value={formatCurrency(Number(q.rentaMensual))} />
              <DetailRow label="Renta + IVA" value={formatCurrency(Number(q.rentaMensualIVA))} bold />
              <div className="border-t border-gray-100 pt-2.5">
                <DetailRow label="Total Rentas" value={formatCurrency(Number(q.totalRentas))} />
                <DetailRow label="Total a Pagar" value={formatCurrency(Number(q.totalPagar))} />
                <DetailRow label="Ganancia" value={formatCurrency(Number(q.ganancia))} accent />
              </div>
            </div>
          </div>
        </div>

        {/* Amortization table */}
        {q.amortizacion && q.amortizacion.length > 0 && (
          <div className="bg-white rounded-xl border border-gray-200 p-6 mb-6">
            <h3 className="font-semibold text-gray-900 mb-4">Tabla de Amortizacion</h3>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-200">
                    <th className="py-2 px-3 text-left font-medium text-gray-500">#</th>
                    <th className="py-2 px-3 text-right font-medium text-gray-500">Saldo Inicial</th>
                    <th className="py-2 px-3 text-right font-medium text-gray-500">Capital</th>
                    <th className="py-2 px-3 text-right font-medium text-gray-500">Interes</th>
                    <th className="py-2 px-3 text-right font-medium text-gray-500">Renta</th>
                    <th className="py-2 px-3 text-right font-medium text-gray-500">IVA</th>
                    <th className="py-2 px-3 text-right font-medium text-gray-500">Renta + IVA</th>
                    <th className="py-2 px-3 text-right font-medium text-gray-500">Saldo Final</th>
                  </tr>
                </thead>
                <tbody>
                  {q.amortizacion.map((row) => (
                    <tr key={row.periodo} className="border-b border-gray-50 hover:bg-gray-50">
                      <td className="py-2 px-3 text-gray-600">{row.periodo}</td>
                      <td className="py-2 px-3 text-right text-gray-600">{formatCurrency(Number(row.saldoInicial))}</td>
                      <td className="py-2 px-3 text-right text-gray-700">{formatCurrency(Number(row.pagoCapital))}</td>
                      <td className="py-2 px-3 text-right text-gray-700">{formatCurrency(Number(row.intereses))}</td>
                      <td className="py-2 px-3 text-right text-gray-700">{formatCurrency(Number(row.renta))}</td>
                      <td className="py-2 px-3 text-right text-gray-500">{formatCurrency(Number(row.iva))}</td>
                      <td className="py-2 px-3 text-right font-medium text-gray-900">{formatCurrency(Number(row.renta) + Number(row.iva))}</td>
                      <td className="py-2 px-3 text-right text-gray-500">{formatCurrency(Number(row.saldoFinal))}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Options */}
        {q.opciones && q.opciones.length > 0 && (
          <div className="bg-white rounded-xl border border-gray-200 p-6">
            <h3 className="font-semibold text-gray-900 mb-4">Opciones de Arrendamiento</h3>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-200">
                    <th className="py-2 px-3 text-left font-medium text-gray-500">Opcion</th>
                    <th className="py-2 px-3 text-center font-medium text-gray-500">Producto</th>
                    <th className="py-2 px-3 text-center font-medium text-gray-500">Riesgo</th>
                    <th className="py-2 px-3 text-right font-medium text-gray-500">Enganche</th>
                    <th className="py-2 px-3 text-right font-medium text-gray-500">Deposito</th>
                    <th className="py-2 px-3 text-right font-medium text-gray-500">Renta + IVA</th>
                    <th className="py-2 px-3 text-right font-medium text-gray-500">Residual</th>
                    <th className="py-2 px-3 text-right font-medium text-gray-500">Total</th>
                  </tr>
                </thead>
                <tbody>
                  {q.opciones.map((op, i) => (
                    <tr key={i} className="border-b border-gray-50">
                      <td className="py-2 px-3 text-gray-700">{op.nombre}</td>
                      <td className="py-2 px-3 text-center text-gray-600">{op.producto}</td>
                      <td className="py-2 px-3 text-center">
                        <span className="text-xs bg-inyecta-100 text-inyecta-700 px-2 py-0.5 rounded">{op.nivelRiesgo}</span>
                      </td>
                      <td className="py-2 px-3 text-right text-gray-700">{formatCurrency(Number(op.enganche))}</td>
                      <td className="py-2 px-3 text-right text-gray-700">{formatCurrency(Number(op.depositoGarantia))}</td>
                      <td className="py-2 px-3 text-right font-medium text-gray-900">{formatCurrency(Number(op.rentaMensualIVA))}</td>
                      <td className="py-2 px-3 text-right text-gray-700">{formatCurrency(Number(op.valorResidual))}</td>
                      <td className="py-2 px-3 text-right text-gray-700">{formatCurrency(Number(op.totalPagar))}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {q.observaciones && (
          <div className="bg-white rounded-xl border border-gray-200 p-6 mt-6">
            <h3 className="font-semibold text-gray-900 mb-2">Observaciones</h3>
            <p className="text-sm text-gray-600">{q.observaciones}</p>
          </div>
        )}
      </div>

      {/* Footer */}
      <div className="text-center text-xs text-gray-400 mt-8 print:mt-4">
        <p>{branding.empresa.razonSocial}</p>
        <p>Vigencia: {formatDate(q.vigenciaHasta)} | Elaborado por: {q.user?.nombre} {q.user?.apellidos}</p>
      </div>
    </div>
  );
}

function SummaryCard({ label, value, highlight }: { label: string; value: string; highlight?: boolean }) {
  return (
    <div className="bg-white rounded-xl border border-gray-200 p-4">
      <p className="text-xs text-gray-500">{label}</p>
      <p className={`text-lg font-bold mt-1 ${highlight ? 'text-inyecta-700' : 'text-gray-900'}`}>{value}</p>
    </div>
  );
}

function DetailRow({ label, value, bold, accent }: { label: string; value: string; bold?: boolean; accent?: boolean }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-sm text-gray-500">{label}</span>
      <span className={`text-sm ${accent ? 'text-accent font-semibold' : bold ? 'font-semibold text-inyecta-700' : 'text-gray-900'}`}>
        {value}
      </span>
    </div>
  );
}
