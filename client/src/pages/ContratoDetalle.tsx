import { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import api from '@/lib/api';
import { formatCurrency, formatDate } from '@/lib/utils';
import { useAuth } from '@/context/AuthContext';
import {
  ArrowLeft, Building2, User, FileText, Users, ClipboardCheck,
  Gavel, PenTool, Banknote, CheckCircle2, ChevronRight, Send,
  StickyNote, Info, History, AlertTriangle, XCircle,
  Table2, Coins, X, TrendingDown, Download,
  FileCheck2, RefreshCw, Eye, ExternalLink,
} from 'lucide-react';
import { pdf } from '@react-pdf/renderer';
import { EstadoCuentaPDF, type EstadoCuentaProps } from '@/lib/pdf/EstadoCuentaPDF';
import ExpedienteTab from '@/components/ExpedienteTab';

interface StageHistoryEntry {
  id: string;
  etapa: string;
  fecha: string;
  observacion?: string;
  usuarioId?: string;
}

interface ContractNote {
  id: string;
  contenido: string;
  tipo: string;
  createdAt: string;
  user: { nombre: string; apellidos: string };
}

interface ContractDetail {
  id: string;
  folio: string;
  producto: 'PURO' | 'FINANCIERO';
  etapa: string;
  etapaFecha: string;
  estatus: string;
  comiteResolucion?: string;
  bienDescripcion: string;
  bienMarca?: string;
  bienModelo?: string;
  bienAnio?: number;
  bienNumSerie?: string;
  bienEstado?: string;
  proveedor?: string;
  valorBien: number;
  valorBienIVA: number;
  plazo: number;
  tasaAnual: number;
  nivelRiesgo: string;
  enganche: number;
  depositoGarantia: number;
  comisionApertura: number;
  rentaInicial: number;
  gpsInstalacion: number;
  seguroAnual: number;
  valorResidual: number;
  montoFinanciar: number;
  rentaMensual: number;
  rentaMensualIVA: number;
  fechaFirma?: string;
  fechaInicio?: string;
  fechaVencimiento?: string;
  motivoTerminacion?: string;
  createdAt: string;
  client: {
    id: string;
    tipo: 'PFAE' | 'PM';
    nombre?: string;
    apellidoPaterno?: string;
    apellidoMaterno?: string;
    razonSocial?: string;
    rfc?: string;
    email?: string;
    telefono?: string;
  };
  user: { nombre: string; apellidos: string; email: string };
  categoria?: { nombre: string; requiereGPS: boolean };
  stageHistory: StageHistoryEntry[];
  notas: ContractNote[];
}

const STAGE_ORDER = ['SOLICITUD', 'ANALISIS_CLIENTE', 'ANALISIS_BIEN', 'COMITE', 'FORMALIZACION', 'DESEMBOLSO', 'ACTIVO'];

const STAGE_LABELS: Record<string, string> = {
  SOLICITUD: 'Solicitud',
  ANALISIS_CLIENTE: 'Analisis Cliente',
  ANALISIS_BIEN: 'Analisis Bien',
  COMITE: 'Comite',
  FORMALIZACION: 'Formalizacion',
  DESEMBOLSO: 'Desembolso',
  ACTIVO: 'Activo',
};

const STAGE_ICONS: Record<string, typeof FileText> = {
  SOLICITUD: FileText,
  ANALISIS_CLIENTE: Users,
  ANALISIS_BIEN: ClipboardCheck,
  COMITE: Gavel,
  FORMALIZACION: PenTool,
  DESEMBOLSO: Banknote,
  ACTIVO: CheckCircle2,
};

const ESTATUS_LABELS: Record<string, { label: string; color: string }> = {
  EN_PROCESO: { label: 'En Proceso', color: 'bg-blue-100 text-blue-700' },
  VIGENTE: { label: 'Vigente', color: 'bg-emerald-100 text-emerald-700' },
  VENCIDO: { label: 'Vencido', color: 'bg-red-100 text-red-700' },
  TERMINADO: { label: 'Terminado', color: 'bg-gray-100 text-gray-700' },
  RESCINDIDO: { label: 'Rescindido', color: 'bg-red-100 text-red-700' },
  REESTRUCTURADO: { label: 'Reestructurado', color: 'bg-amber-100 text-amber-700' },
};

const tabs = [
  { id: 'pipeline', label: 'Pipeline', icon: History },
  { id: 'info', label: 'Informacion', icon: Info },
  { id: 'documentos', label: 'Documentos', icon: ClipboardCheck },
  { id: 'solicitud-cnbv', label: 'Solicitud CNBV', icon: FileCheck2 },
  { id: 'amortizacion', label: 'Amortizacion', icon: Table2 },
  { id: 'notas', label: 'Bitacora', icon: StickyNote },
];

interface ScheduleEntry {
  periodo: number;
  fechaPago: string;
  estatus: 'PAGADO' | 'PARCIAL' | 'VENCIDO' | 'PENDIENTE' | 'FUTURO';
  diasAtraso: number;
  renta: number;
  ivaRenta: number;
  saldoInicial: number;
  saldoFinal: number;
  intereses: number;
  pagoCapital: number;
  desglose: {
    rentaPendiente: number;
    ivaPendiente: number;
    rentaTotalPendiente: number;
    moratorioPendiente: number;
    ivaMoratorioPendiente: number;
    totalAdeudado: number;
  };
  pagos: { cantidad: number; totalPagado: number };
}

const STATUS_BADGE: Record<string, string> = {
  PAGADO: 'bg-emerald-100 text-emerald-700',
  PARCIAL: 'bg-amber-100 text-amber-700',
  VENCIDO: 'bg-red-100 text-red-700',
  PENDIENTE: 'bg-blue-100 text-blue-700',
  FUTURO: 'bg-gray-100 text-gray-500',
};

function clientName(c: ContractDetail['client']): string {
  if (c.tipo === 'PM') return c.razonSocial || '';
  return [c.nombre, c.apellidoPaterno, c.apellidoMaterno].filter(Boolean).join(' ');
}

// Adapter: respuesta de /api/cobranza/estado-cuenta/:id  →  props de EstadoCuentaPDF.
// El endpoint internal trae datos de adeudo y de contrato anidados, pero no
// los campos contractuales completos (rentaMensual, fechaInicio, etc.) — esos
// los tomamos del `contract` ya cargado en la página. Así evitamos un round-trip
// extra y reusamos el mismo componente que el Portal del Arrendatario (T11).
//
// La forma del response viene definida en server/src/routes/cobranza.ts
// (handler GET /estado-cuenta/:contractId).
interface EstadoCuentaApiResponse {
  fechaCorte: string;
  contrato: { folio: string; producto: string; plazo: number; tasaAnual: number };
  resumen: {
    rentaVencida: number;
    moratorios: number;
    rentaPendiente: number;
    totalAdeudo: number;
    periodosVencidos: number;
    periodosParciales: number;
  };
  periodos: Array<{
    periodo: number;
    fechaPago: string;
    estatus: 'PAGADO' | 'PARCIAL' | 'VENCIDO' | 'PENDIENTE' | 'FUTURO';
    diasAtraso: number;
    renta: number;
    ivaRenta: number;
    moratorio: { pendiente: number; ivaPendiente: number };
    desglose: { rentaPendiente: number; ivaPendiente: number; totalAdeudado: number };
  }>;
}

function mapEstadoCuentaProps(
  data: EstadoCuentaApiResponse,
  contract: ContractDetail,
): EstadoCuentaProps {
  // Próximo pago = primer periodo PENDIENTE (orden temporal natural del backend).
  // Si todo está pagado/futuro, queda null y el PDF muestra "Al corriente".
  const proximo = data.periodos.find(p => p.estatus === 'PENDIENTE');
  return {
    cliente: {
      nombre: clientName(contract.client),
      rfc: contract.client.rfc ?? null,
      email: contract.client.email ?? null,
    },
    contrato: {
      folio: contract.folio,
      producto: contract.producto,
      plazo: contract.plazo,
      tasaAnual: contract.tasaAnual,
      rentaMensual: contract.rentaMensual,
      rentaMensualIVA: contract.rentaMensualIVA,
      fechaInicio: contract.fechaInicio ?? null,
      fechaVencimiento: contract.fechaVencimiento ?? null,
      estatus: contract.estatus,
    },
    resumen: {
      totalAdeudado: data.resumen.totalAdeudo,
      // El PDF muestra una métrica única; sumamos vencidos + parciales para
      // reflejar todos los periodos en mora real (un PARCIAL también está vencido).
      periodosVencidos: data.resumen.periodosVencidos + data.resumen.periodosParciales,
      proximoPago: proximo
        ? {
            periodo: proximo.periodo,
            fecha: proximo.fechaPago,
            monto: proximo.desglose.totalAdeudado,
          }
        : null,
    },
    periodos: data.periodos.map(p => ({
      periodo: p.periodo,
      fechaPago: p.fechaPago,
      renta: p.renta,
      ivaRenta: p.ivaRenta,
      rentaPendiente: p.desglose.rentaPendiente,
      ivaPendiente: p.desglose.ivaPendiente,
      moratorio: p.moratorio.pendiente,
      ivaMoratorio: p.moratorio.ivaPendiente,
      totalAdeudado: p.desglose.totalAdeudado,
      diasAtraso: p.diasAtraso,
      estatus: p.estatus,
    })),
    fechaCorte: new Date(data.fechaCorte),
  };
}

export default function ContratoDetalle() {
  const { id } = useParams();
  const { user } = useAuth();
  const [contract, setContract] = useState<ContractDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState('pipeline');
  const [advancing, setAdvancing] = useState(false);
  const [advanceObs, setAdvanceObs] = useState('');
  const [comiteRes, setComiteRes] = useState('');
  const [showAdvanceForm, setShowAdvanceForm] = useState(false);
  const [newNote, setNewNote] = useState('');
  const [sendingNote, setSendingNote] = useState(false);

  // Amortización tab
  const [schedule, setSchedule] = useState<ScheduleEntry[] | null>(null);
  const [loadingSchedule, setLoadingSchedule] = useState(false);
  const [showExtraModal, setShowExtraModal] = useState(false);
  const [extraMonto, setExtraMonto] = useState<string>('');
  const [extraRef, setExtraRef] = useState('');
  const [extraObs, setExtraObs] = useState('');
  const [extraSaving, setExtraSaving] = useState(false);
  const [extraError, setExtraError] = useState('');
  const [extraSuccess, setExtraSuccess] = useState<{
    saldoAnterior: number;
    saldoNuevo: number;
    rentaAnterior: number;
    rentaNueva: number;
    ahorroPorPeriodo: number;
  } | null>(null);

  // Solicitud CNBV (PDF auto-llenado)
  const [cnbvTplStatus, setCnbvTplStatus] = useState<{
    exists: boolean;
    size?: number;
    mtime?: string;
  } | null>(null);
  const [cnbvLoadingTpl, setCnbvLoadingTpl] = useState(false);
  const [cnbvGenerating, setCnbvGenerating] = useState(false);
  const [cnbvPdfUrl, setCnbvPdfUrl] = useState<string | null>(null);
  const [cnbvCoverage, setCnbvCoverage] = useState<{
    text: number;
    check: number;
    missing: number;
  } | null>(null);
  const [cnbvError, setCnbvError] = useState<string | null>(null);

  const fetchContract = () => {
    api.get(`/contracts/${id}`)
      .then((res) => setContract(res.data))
      .catch(() => {})
      .finally(() => setLoading(false));
  };

  const fetchSchedule = () => {
    setLoadingSchedule(true);
    api.get(`/cobranza/contract/${id}`)
      .then((res) => setSchedule(res.data.schedule))
      .catch(() => {})
      .finally(() => setLoadingSchedule(false));
  };

  useEffect(() => { fetchContract(); }, [id]);
  useEffect(() => {
    if (tab === 'amortizacion' && !schedule && !loadingSchedule) {
      fetchSchedule();
    }
    if (tab === 'solicitud-cnbv' && !cnbvTplStatus && !cnbvLoadingTpl) {
      setCnbvLoadingTpl(true);
      api.get('/templates/solicitud-cnbv/status')
        .then((r) => setCnbvTplStatus(r.data))
        .catch(() => setCnbvTplStatus({ exists: false }))
        .finally(() => setCnbvLoadingTpl(false));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab]);

  // Limpia el blob al desmontar / cambiar contrato (no leakear memoria)
  useEffect(() => {
    return () => {
      if (cnbvPdfUrl) URL.revokeObjectURL(cnbvPdfUrl);
    };
  }, [cnbvPdfUrl]);

  const [downloadingEdoCta, setDownloadingEdoCta] = useState(false);
  const handleDownloadEstadoCuenta = async () => {
    if (!id || !contract) return;
    setDownloadingEdoCta(true);
    try {
      const res = await api.get(`/cobranza/estado-cuenta/${id}`);
      const props = mapEstadoCuentaProps(res.data, contract);
      // Generación imperativa: el botón hace fetch y luego dispara el blob.
      // Usamos pdf().toBlob() en vez de <PDFDownloadLink> porque la data
      // viene del server al hacer click (no podemos pre-renderizar el doc).
      const blob = await pdf(<EstadoCuentaPDF {...props} />).toBlob();
      const url  = URL.createObjectURL(blob);
      const a    = document.createElement('a');
      a.href     = url;
      a.download = `EstadoCuenta_${contract.folio}.pdf`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error('Error generando estado de cuenta:', err);
      alert('No se pudo generar el estado de cuenta. Verifica que el contrato esté activo.');
    } finally {
      setDownloadingEdoCta(false);
    }
  };

  const generateCnbv = async () => {
    if (!id) return;
    setCnbvGenerating(true);
    setCnbvError(null);
    if (cnbvPdfUrl) {
      URL.revokeObjectURL(cnbvPdfUrl);
      setCnbvPdfUrl(null);
    }
    try {
      const res = await api.get(`/contracts/${id}/solicitud-cnbv`, {
        responseType: 'blob',
      });
      const blob = new Blob([res.data], { type: 'application/pdf' });
      setCnbvPdfUrl(URL.createObjectURL(blob));
      setCnbvCoverage({
        text: Number(res.headers['x-solicitud-text-fields'] || 0),
        check: Number(res.headers['x-solicitud-check-fields'] || 0),
        missing: Number(res.headers['x-solicitud-missing-fields'] || 0),
      });
    } catch (err: any) {
      // Cuando responseType es blob, el cuerpo de error también llega como blob.
      let msg = 'No se pudo generar la solicitud';
      try {
        const blob = err.response?.data;
        if (blob instanceof Blob) {
          const txt = await blob.text();
          const json = JSON.parse(txt);
          msg = json?.error?.message || msg;
        }
      } catch { /* ignore */ }
      setCnbvError(msg);
    } finally {
      setCnbvGenerating(false);
    }
  };

  const downloadCnbv = () => {
    if (!cnbvPdfUrl || !contract) return;
    const a = document.createElement('a');
    a.href = cnbvPdfUrl;
    a.download = `SolicitudCNBV_${contract.folio}.pdf`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  };

  const submitExtraPayment = async () => {
    const monto = Number(extraMonto);
    if (!monto || monto <= 0) {
      setExtraError('Monto inválido');
      return;
    }
    setExtraSaving(true);
    setExtraError('');
    try {
      const res = await api.post('/cobranza/pay-extra', {
        contractId: id,
        monto,
        referencia: extraRef || undefined,
        observaciones: extraObs || undefined,
      });
      setExtraSuccess(res.data.recalculo);
      setExtraMonto('');
      setExtraRef('');
      setExtraObs('');
      // Recargar tabla y contrato (renta cambió)
      fetchSchedule();
      fetchContract();
    } catch (err: any) {
      const msg = err.response?.data?.error;
      setExtraError(typeof msg === 'string' ? msg : 'Error al aplicar abono');
    } finally {
      setExtraSaving(false);
    }
  };

  const handleAdvance = async () => {
    if (!contract) return;
    if (contract.etapa === 'COMITE' && !comiteRes) return;
    setAdvancing(true);
    try {
      await api.put(`/contracts/${id}/advance`, {
        observacion: advanceObs || undefined,
        comiteResolucion: contract.etapa === 'COMITE' ? comiteRes : undefined,
      });
      setAdvanceObs('');
      setComiteRes('');
      setShowAdvanceForm(false);
      fetchContract();
    } catch (err: any) {
      alert(err.response?.data?.error || 'Error al avanzar etapa');
    }
    setAdvancing(false);
  };

  const addNote = async () => {
    if (!newNote.trim()) return;
    setSendingNote(true);
    try {
      await api.post(`/contracts/${id}/notes`, { contenido: newNote });
      setNewNote('');
      fetchContract();
    } catch {}
    setSendingNote(false);
  };

  if (loading) return (
    <div className="flex items-center justify-center py-20">
      <div className="animate-spin rounded-full h-8 w-8 border-2 border-inyecta-600 border-t-transparent" />
    </div>
  );

  if (!contract) return (
    <div className="text-center py-20">
      <p className="text-gray-500">Contrato no encontrado</p>
      <Link to="/contratos" className="text-inyecta-600 hover:underline text-sm mt-2 inline-block">Volver</Link>
    </div>
  );

  const c = contract;
  const currentIdx = STAGE_ORDER.indexOf(c.etapa);
  const canAdvance = c.estatus === 'EN_PROCESO' && currentIdx < STAGE_ORDER.length - 1;
  const isTerminal = c.estatus === 'RESCINDIDO' || c.estatus === 'TERMINADO';
  const nextStage = canAdvance ? STAGE_ORDER[currentIdx + 1] : null;
  const est = ESTATUS_LABELS[c.estatus] || { label: c.estatus, color: 'bg-gray-100 text-gray-600' };

  return (
    <div className="max-w-4xl mx-auto">
      {/* Header */}
      <div className="flex items-start justify-between mb-6">
        <div className="flex items-center gap-3">
          <Link to="/contratos" className="text-gray-400 hover:text-gray-600 mt-1">
            <ArrowLeft size={20} />
          </Link>
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <h1 className="text-xl font-bold text-gray-900">{c.folio}</h1>
              <span className={`text-xs font-medium px-2 py-0.5 rounded ${est.color}`}>{est.label}</span>
              <span className={`text-xs px-2 py-0.5 rounded ${
                c.producto === 'PURO' ? 'bg-cyan-100 text-cyan-700' : 'bg-violet-100 text-violet-700'
              }`}>
                {c.producto === 'PURO' ? 'Puro' : 'Financiero'}
              </span>
            </div>
            <p className="text-gray-500 text-sm mt-0.5">
              {c.bienDescripcion} · Creado {formatDate(c.createdAt)}
            </p>
          </div>
        </div>
        <div className="flex flex-col items-end gap-2 mt-1">
          <Link
            to={`/clientes/${c.client.id}`}
            className="text-xs text-inyecta-600 hover:underline flex items-center gap-1"
          >
            {c.client.tipo === 'PM' ? <Building2 size={12} /> : <User size={12} />}
            {clientName(c.client)}
          </Link>
          {c.estatus === 'VIGENTE' && (
            <button
              onClick={handleDownloadEstadoCuenta}
              disabled={downloadingEdoCta}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-inyecta-600 hover:bg-inyecta-700 text-white rounded-lg text-xs font-medium shadow-sm disabled:opacity-50"
            >
              <Download size={12} /> {downloadingEdoCta ? 'Generando…' : 'Estado de Cuenta PDF'}
            </button>
          )}
        </div>
      </div>

      {/* Pipeline Progress */}
      <div className="bg-white rounded-xl border border-gray-200 p-4 mb-6">
        <div className="flex items-center gap-0 overflow-x-auto">
          {STAGE_ORDER.map((stage, i) => {
            const Icon = STAGE_ICONS[stage];
            const isCompleted = i < currentIdx;
            const isCurrent = i === currentIdx;
            return (
              <div key={stage} className="flex items-center flex-1 min-w-0">
                <div className="flex flex-col items-center flex-1 min-w-0">
                  <div className={`w-8 h-8 rounded-full flex items-center justify-center ${
                    isCompleted ? 'bg-emerald-500 text-white' :
                    isCurrent ? 'bg-inyecta-700 text-white ring-4 ring-inyecta-100' :
                    'bg-gray-100 text-gray-400'
                  }`}>
                    {isCompleted ? <CheckCircle2 size={16} /> : Icon ? <Icon size={14} /> : <span className="text-xs">{i + 1}</span>}
                  </div>
                  <span className={`text-[10px] mt-1 text-center leading-tight ${
                    isCurrent ? 'text-inyecta-700 font-semibold' :
                    isCompleted ? 'text-emerald-600' :
                    'text-gray-400'
                  }`}>
                    {STAGE_LABELS[stage]}
                  </span>
                </div>
                {i < STAGE_ORDER.length - 1 && (
                  <div className={`w-6 h-0.5 flex-shrink-0 mx-0.5 ${isCompleted ? 'bg-emerald-400' : 'bg-gray-200'}`} />
                )}
              </div>
            );
          })}
        </div>

        {/* Advance button */}
        {canAdvance && !showAdvanceForm && (
          <div className="mt-4 pt-4 border-t border-gray-100 flex justify-center">
            <button
              onClick={() => setShowAdvanceForm(true)}
              className="flex items-center gap-2 px-4 py-2 bg-inyecta-700 text-white rounded-lg text-sm font-medium hover:bg-inyecta-800 transition-colors"
            >
              <ChevronRight size={16} />
              Avanzar a {STAGE_LABELS[nextStage!]}
            </button>
          </div>
        )}

        {/* Advance form */}
        {showAdvanceForm && (
          <div className="mt-4 pt-4 border-t border-gray-100 space-y-3">
            <div className="flex items-center gap-2 text-sm text-gray-700">
              <ChevronRight size={14} className="text-inyecta-600" />
              <span>Avanzar de <strong>{STAGE_LABELS[c.etapa]}</strong> a <strong>{STAGE_LABELS[nextStage!]}</strong></span>
            </div>

            {c.etapa === 'COMITE' && (
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Resolucion del Comite *</label>
                <div className="flex gap-2">
                  {[
                    { value: 'APROBADO', label: 'Aprobado', icon: CheckCircle2, color: 'border-emerald-300 bg-emerald-50 text-emerald-700' },
                    { value: 'APROBADO_CONDICIONES', label: 'Aprobado c/condiciones', icon: AlertTriangle, color: 'border-amber-300 bg-amber-50 text-amber-700' },
                    { value: 'RECHAZADO', label: 'Rechazado', icon: XCircle, color: 'border-red-300 bg-red-50 text-red-700' },
                  ].map((opt) => (
                    <button
                      key={opt.value}
                      onClick={() => setComiteRes(opt.value)}
                      className={`flex items-center gap-1.5 px-3 py-2 rounded-lg border-2 text-xs font-medium transition-colors ${
                        comiteRes === opt.value ? opt.color : 'border-gray-200 text-gray-500 hover:border-gray-300'
                      }`}
                    >
                      <opt.icon size={14} />
                      {opt.label}
                    </button>
                  ))}
                </div>
              </div>
            )}

            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Observacion (opcional)</label>
              <textarea
                value={advanceObs}
                onChange={(e) => setAdvanceObs(e.target.value)}
                placeholder="Notas sobre el avance de etapa..."
                rows={2}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-inyecta-500 focus:border-inyecta-500 outline-none resize-none"
              />
            </div>
            <div className="flex items-center gap-2 justify-end">
              <button
                onClick={() => { setShowAdvanceForm(false); setComiteRes(''); setAdvanceObs(''); }}
                className="px-3 py-1.5 text-sm text-gray-600 hover:text-gray-800"
              >
                Cancelar
              </button>
              <button
                onClick={handleAdvance}
                disabled={advancing || (c.etapa === 'COMITE' && !comiteRes)}
                className="flex items-center gap-1.5 px-4 py-1.5 bg-inyecta-700 text-white rounded-lg text-sm font-medium hover:bg-inyecta-800 disabled:bg-gray-300 transition-colors"
              >
                {advancing ? (
                  <div className="animate-spin rounded-full h-3.5 w-3.5 border-2 border-white border-t-transparent" />
                ) : (
                  <ChevronRight size={14} />
                )}
                {comiteRes === 'RECHAZADO' ? 'Rechazar Contrato' : 'Confirmar Avance'}
              </button>
            </div>
          </div>
        )}

        {isTerminal && c.motivoTerminacion && (
          <div className="mt-4 pt-4 border-t border-gray-100">
            <div className="flex items-start gap-2 p-3 bg-red-50 rounded-lg">
              <XCircle size={16} className="text-red-500 mt-0.5 flex-shrink-0" />
              <div>
                <p className="text-sm font-medium text-red-700">Contrato {est.label.toLowerCase()}</p>
                <p className="text-xs text-red-600 mt-0.5">{c.motivoTerminacion}</p>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-6">
        <SummaryCard label="Valor del Bien" value={formatCurrency(Number(c.valorBien))} />
        <SummaryCard label="Monto a Financiar" value={formatCurrency(Number(c.montoFinanciar))} />
        <SummaryCard label="Renta + IVA" value={formatCurrency(Number(c.rentaMensualIVA))} highlight />
        <SummaryCard label="Plazo" value={`${c.plazo} meses · Riesgo ${c.nivelRiesgo}`} />
      </div>

      {/* Tabs */}
      <div className="flex gap-1 mb-6 border-b border-gray-200">
        {tabs.map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={`flex items-center gap-1.5 px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${
              tab === t.id
                ? 'border-inyecta-600 text-inyecta-700'
                : 'border-transparent text-gray-500 hover:text-gray-700'
            }`}
          >
            <t.icon size={14} />
            {t.label}
          </button>
        ))}
      </div>

      {/* Tab: Pipeline History */}
      {tab === 'pipeline' && (
        <div className="bg-white rounded-xl border border-gray-200 p-6">
          <h3 className="font-semibold text-gray-900 mb-4">Historial de Etapas</h3>
          {c.stageHistory.length === 0 ? (
            <p className="text-sm text-gray-400 text-center py-4">Sin historial</p>
          ) : (
            <div className="relative">
              <div className="absolute left-4 top-0 bottom-0 w-0.5 bg-gray-200" />
              <div className="space-y-4">
                {c.stageHistory.map((entry, i) => {
                  const Icon = STAGE_ICONS[entry.etapa] || History;
                  const isFirst = i === 0;
                  return (
                    <div key={entry.id} className="relative flex items-start gap-4 pl-2">
                      <div className={`relative z-10 w-5 h-5 rounded-full flex items-center justify-center ${
                        isFirst ? 'bg-inyecta-700 text-white' : 'bg-white border-2 border-gray-300 text-gray-400'
                      }`}>
                        <Icon size={10} />
                      </div>
                      <div className="flex-1 pb-2">
                        <div className="flex items-center gap-2">
                          <span className={`text-sm font-medium ${isFirst ? 'text-inyecta-700' : 'text-gray-700'}`}>
                            {STAGE_LABELS[entry.etapa] || entry.etapa}
                          </span>
                          <span className="text-xs text-gray-400">{formatDate(entry.fecha)}</span>
                        </div>
                        {entry.observacion && (
                          <p className="text-xs text-gray-500 mt-0.5">{entry.observacion}</p>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Tab: Contract Info */}
      {tab === 'info' && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div className="bg-white rounded-xl border border-gray-200 p-6">
            <h3 className="font-semibold text-gray-900 mb-4">Datos del Bien</h3>
            <div className="space-y-2.5">
              <InfoRow label="Descripcion" value={c.bienDescripcion} />
              <InfoRow label="Marca" value={c.bienMarca} />
              <InfoRow label="Modelo" value={c.bienModelo} />
              <InfoRow label="Año" value={c.bienAnio ? String(c.bienAnio) : undefined} />
              <InfoRow label="No. Serie" value={c.bienNumSerie} mono />
              <InfoRow label="Estado" value={c.bienEstado} />
              <InfoRow label="Proveedor" value={c.proveedor} />
              {c.categoria && <InfoRow label="Categoria" value={c.categoria.nombre} />}
            </div>
          </div>

          <div className="bg-white rounded-xl border border-gray-200 p-6">
            <h3 className="font-semibold text-gray-900 mb-4">Parametros Financieros</h3>
            <div className="space-y-2.5">
              <InfoRow label="Valor del Bien" value={formatCurrency(Number(c.valorBien))} />
              <InfoRow label="Valor + IVA" value={formatCurrency(Number(c.valorBienIVA))} />
              <InfoRow label="Tasa Anual" value={`${(Number(c.tasaAnual) * 100).toFixed(0)}%`} />
              <InfoRow label="Nivel de Riesgo" value={c.nivelRiesgo} />
              <div className="border-t border-gray-100 pt-2.5">
                <InfoRow label="Enganche" value={formatCurrency(Number(c.enganche))} />
                <InfoRow label="Deposito Garantia" value={formatCurrency(Number(c.depositoGarantia))} />
                <InfoRow label="Comision Apertura" value={formatCurrency(Number(c.comisionApertura))} />
                <InfoRow label="Renta Inicial" value={formatCurrency(Number(c.rentaInicial))} />
                <InfoRow label="GPS Instalacion" value={formatCurrency(Number(c.gpsInstalacion))} />
                <InfoRow label="Seguro Anual" value={formatCurrency(Number(c.seguroAnual))} />
                <InfoRow label="Valor Residual" value={formatCurrency(Number(c.valorResidual))} />
              </div>
              <div className="border-t border-gray-100 pt-2.5">
                <InfoRow label="Monto a Financiar" value={formatCurrency(Number(c.montoFinanciar))} bold />
                <InfoRow label="Renta Mensual" value={formatCurrency(Number(c.rentaMensual))} />
                <InfoRow label="Renta + IVA" value={formatCurrency(Number(c.rentaMensualIVA))} accent />
              </div>
            </div>
          </div>

          <div className="bg-white rounded-xl border border-gray-200 p-6">
            <h3 className="font-semibold text-gray-900 mb-4">Cliente</h3>
            <div className="space-y-2.5">
              <InfoRow label="Tipo" value={c.client.tipo} />
              <InfoRow label="Nombre" value={clientName(c.client)} />
              <InfoRow label="RFC" value={c.client.rfc} mono />
              <InfoRow label="Email" value={c.client.email} />
              <InfoRow label="Telefono" value={c.client.telefono} />
            </div>
            <Link
              to={`/clientes/${c.client.id}`}
              className="inline-flex items-center gap-1 text-xs text-inyecta-600 hover:underline mt-4"
            >
              Ver ficha completa del cliente <ChevronRight size={12} />
            </Link>
          </div>

          <div className="bg-white rounded-xl border border-gray-200 p-6">
            <h3 className="font-semibold text-gray-900 mb-4">Fechas y Responsable</h3>
            <div className="space-y-2.5">
              <InfoRow label="Fecha Creacion" value={formatDate(c.createdAt)} />
              {c.fechaFirma && <InfoRow label="Fecha Firma" value={formatDate(c.fechaFirma)} />}
              {c.fechaInicio && <InfoRow label="Fecha Inicio" value={formatDate(c.fechaInicio)} />}
              {c.fechaVencimiento && <InfoRow label="Fecha Vencimiento" value={formatDate(c.fechaVencimiento)} />}
              <div className="border-t border-gray-100 pt-2.5">
                <InfoRow label="Analista" value={`${c.user.nombre} ${c.user.apellidos}`} />
                <InfoRow label="Email" value={c.user.email} />
              </div>
              {c.comiteResolucion && (
                <div className="border-t border-gray-100 pt-2.5">
                  <InfoRow label="Resolucion Comite" value={c.comiteResolucion.replace(/_/g, ' ')} />
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Tab: Expediente del contrato (por actor) */}
      {tab === 'documentos' && id && <ExpedienteTab contractId={id} />}

      {/* Tab: Amortización */}
      {/* Tab: Solicitud CNBV (PDF auto-llenado) */}
      {tab === 'solicitud-cnbv' && (
        <div className="space-y-4">
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 text-xs text-blue-800 flex items-start gap-2">
            <FileCheck2 size={14} className="mt-0.5 flex-shrink-0" />
            <div>
              <strong>Solicitud de Crédito CNBV pre-llenada.</strong> El sistema toma los
              datos del contrato (cliente, representante legal, socios, avales, perfil
              transaccional, declaraciones PEP, proveedor) y los inserta en el PDF
              editable que subió el administrador. <em>El archivo NO se aplana</em> —
              puedes corregir cualquier campo desde Acrobat antes de imprimirlo y
              firmarlo.
            </div>
          </div>

          {cnbvLoadingTpl && (
            <div className="flex items-center justify-center py-12">
              <div className="animate-spin rounded-full h-6 w-6 border-2 border-inyecta-600 border-t-transparent" />
            </div>
          )}

          {!cnbvLoadingTpl && cnbvTplStatus && !cnbvTplStatus.exists && (
            <div className="bg-amber-50 border border-amber-200 rounded-xl p-6 text-center">
              <AlertTriangle size={32} className="mx-auto text-amber-500 mb-2" />
              <h3 className="font-semibold text-amber-800">Template no disponible</h3>
              <p className="text-sm text-amber-700 mt-1 max-w-md mx-auto">
                Aún no se ha subido el formato editable de la Solicitud CNBV. Pide a un
                administrador que lo cargue desde
                <Link
                  to="/admin/templates"
                  className="text-amber-900 underline hover:text-amber-700 mx-1"
                >
                  Administración › Plantillas
                </Link>
                para poder generar el PDF.
              </p>
            </div>
          )}

          {!cnbvLoadingTpl && cnbvTplStatus?.exists && (
            <>
              <div className="bg-white rounded-xl border border-gray-200 p-4">
                <div className="flex items-center justify-between flex-wrap gap-3">
                  <div className="text-xs text-gray-500">
                    Template:{' '}
                    <span className="font-medium text-gray-700">solicitud-cnbv.pdf</span>
                    {cnbvTplStatus.size != null && (
                      <> · {(cnbvTplStatus.size / 1024).toFixed(1)} KB</>
                    )}
                    {cnbvTplStatus.mtime && (
                      <> · subido {formatDate(cnbvTplStatus.mtime)}</>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    {cnbvPdfUrl && (
                      <>
                        <a
                          href={cnbvPdfUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="flex items-center gap-1.5 px-3 py-1.5 border border-gray-300 hover:bg-gray-50 text-gray-700 rounded-lg text-xs font-medium"
                        >
                          <ExternalLink size={12} /> Abrir en pestaña
                        </a>
                        <button
                          onClick={downloadCnbv}
                          className="flex items-center gap-1.5 px-3 py-1.5 border border-gray-300 hover:bg-gray-50 text-gray-700 rounded-lg text-xs font-medium"
                        >
                          <Download size={12} /> Descargar
                        </button>
                      </>
                    )}
                    <button
                      onClick={generateCnbv}
                      disabled={cnbvGenerating}
                      className="flex items-center gap-1.5 px-3 py-1.5 bg-inyecta-700 hover:bg-inyecta-800 text-white rounded-lg text-xs font-medium shadow-sm disabled:opacity-50"
                    >
                      {cnbvGenerating ? (
                        <>
                          <div className="animate-spin rounded-full h-3.5 w-3.5 border-2 border-white border-t-transparent" />
                          Generando…
                        </>
                      ) : cnbvPdfUrl ? (
                        <>
                          <RefreshCw size={12} /> Regenerar
                        </>
                      ) : (
                        <>
                          <Eye size={12} /> Generar y previsualizar
                        </>
                      )}
                    </button>
                  </div>
                </div>
                {cnbvCoverage && (
                  <div className="mt-3 pt-3 border-t border-gray-100 grid grid-cols-3 gap-3 text-center">
                    <CoverageStat label="Campos de texto" value={cnbvCoverage.text} color="emerald" />
                    <CoverageStat label="Casillas marcadas" value={cnbvCoverage.check} color="blue" />
                    <CoverageStat
                      label="Sin datos"
                      value={cnbvCoverage.missing}
                      color={cnbvCoverage.missing > 50 ? 'amber' : 'gray'}
                    />
                  </div>
                )}
              </div>

              {cnbvError && (
                <div className="bg-red-50 border border-red-200 rounded-lg p-3 text-sm text-red-700 flex items-start gap-2">
                  <XCircle size={16} className="mt-0.5 flex-shrink-0" />
                  <span>{cnbvError}</span>
                </div>
              )}

              {cnbvPdfUrl && (
                <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
                  <iframe
                    src={cnbvPdfUrl}
                    title="Solicitud CNBV"
                    className="w-full"
                    style={{ height: 'calc(100vh - 280px)', minHeight: 600 }}
                  />
                </div>
              )}

              {!cnbvPdfUrl && !cnbvGenerating && !cnbvError && (
                <div className="bg-white rounded-xl border border-dashed border-gray-300 p-12 text-center">
                  <FileCheck2 size={40} className="mx-auto text-gray-300 mb-3" />
                  <p className="text-sm text-gray-500">
                    Presiona <strong>Generar y previsualizar</strong> para crear la solicitud con los datos actuales del contrato.
                  </p>
                </div>
              )}
            </>
          )}
        </div>
      )}

      {tab === 'amortizacion' && (
        <div className="space-y-4">
          <div className="bg-white rounded-xl border border-gray-200 p-4">
            <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
              <div>
                <h3 className="font-semibold text-gray-900">Tabla de Amortización</h3>
                <p className="text-xs text-gray-500 mt-0.5">
                  {c.producto === 'PURO'
                    ? 'Renta plana fija. Abonos extra se prorratean entre rentas restantes.'
                    : 'Sistema Francés. Abonos extra recalculan PMT con saldo nuevo.'}
                </p>
              </div>
              {c.estatus === 'VIGENTE' && (
                <button
                  onClick={() => { setShowExtraModal(true); setExtraSuccess(null); setExtraError(''); }}
                  className="flex items-center gap-1.5 px-3 py-2 bg-violet-600 hover:bg-violet-700 text-white rounded-lg text-sm font-medium shadow-sm"
                >
                  <Coins size={14} /> Aplicar Abono Adicional
                </button>
              )}
            </div>

            {extraSuccess && (
              <div className="mb-3 bg-emerald-50 border border-emerald-200 rounded-lg p-3 text-sm text-emerald-800">
                <div className="flex items-start gap-2">
                  <TrendingDown size={16} className="mt-0.5 flex-shrink-0" />
                  <div>
                    <p className="font-medium">Abono aplicado correctamente.</p>
                    <p className="text-xs mt-1">
                      Saldo: {formatCurrency(extraSuccess.saldoAnterior)} → {formatCurrency(extraSuccess.saldoNuevo)} ·{' '}
                      Renta mensual: {formatCurrency(extraSuccess.rentaAnterior)} → {formatCurrency(extraSuccess.rentaNueva)}{' '}
                      <span className="font-semibold">(ahorro {formatCurrency(extraSuccess.ahorroPorPeriodo)}/mes)</span>
                    </p>
                  </div>
                </div>
              </div>
            )}

            {loadingSchedule ? (
              <div className="flex items-center justify-center py-12">
                <div className="animate-spin rounded-full h-6 w-6 border-2 border-inyecta-600 border-t-transparent" />
              </div>
            ) : !schedule || schedule.length === 0 ? (
              <p className="text-sm text-gray-400 text-center py-8">
                Sin tabla de amortización (el contrato debe estar en etapa ACTIVO)
              </p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-xs min-w-[800px]">
                  <thead>
                    <tr className="border-b border-gray-200 bg-gray-50">
                      <th className="px-2 py-2 text-left font-medium text-gray-500">#</th>
                      <th className="px-2 py-2 text-left font-medium text-gray-500">Vence</th>
                      <th className="px-2 py-2 text-right font-medium text-gray-500">Saldo Ini.</th>
                      {c.producto === 'FINANCIERO' && (
                        <>
                          <th className="px-2 py-2 text-right font-medium text-gray-500">Capital</th>
                          <th className="px-2 py-2 text-right font-medium text-gray-500">Interés</th>
                        </>
                      )}
                      <th className="px-2 py-2 text-right font-medium text-gray-500">Renta</th>
                      <th className="px-2 py-2 text-right font-medium text-gray-500">IVA</th>
                      <th className="px-2 py-2 text-right font-medium text-gray-500">Renta+IVA</th>
                      <th className="px-2 py-2 text-right font-medium text-gray-500">Saldo Fin.</th>
                      <th className="px-2 py-2 text-center font-medium text-gray-500">Estado</th>
                    </tr>
                  </thead>
                  <tbody>
                    {schedule.map((row) => (
                      <tr key={row.periodo} className="border-b border-gray-50 hover:bg-gray-50">
                        <td className="px-2 py-1.5 text-gray-700">{row.periodo}</td>
                        <td className="px-2 py-1.5 text-gray-500">{formatDate(row.fechaPago)}</td>
                        <td className="px-2 py-1.5 text-right text-gray-600">{formatCurrency(Number(row.saldoInicial))}</td>
                        {c.producto === 'FINANCIERO' && (
                          <>
                            <td className="px-2 py-1.5 text-right text-gray-700">{formatCurrency(Number(row.pagoCapital))}</td>
                            <td className="px-2 py-1.5 text-right text-gray-700">{formatCurrency(Number(row.intereses))}</td>
                          </>
                        )}
                        <td className="px-2 py-1.5 text-right text-gray-700">{formatCurrency(Number(row.renta))}</td>
                        <td className="px-2 py-1.5 text-right text-gray-500">{formatCurrency(Number(row.ivaRenta))}</td>
                        <td className="px-2 py-1.5 text-right font-medium text-gray-900">{formatCurrency(Number(row.renta) + Number(row.ivaRenta))}</td>
                        <td className="px-2 py-1.5 text-right text-gray-500">{formatCurrency(Number(row.saldoFinal))}</td>
                        <td className="px-2 py-1.5 text-center">
                          <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded ${STATUS_BADGE[row.estatus] || 'bg-gray-100 text-gray-500'}`}>
                            {row.estatus}
                            {row.diasAtraso > 0 && ` +${row.diasAtraso}d`}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* Modal Abono Adicional */}
          {showExtraModal && (
            <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
              <div className="bg-white rounded-xl shadow-xl max-w-md w-full p-6">
                <div className="flex items-start justify-between mb-4">
                  <div>
                    <h3 className="font-semibold text-gray-900">Aplicar Abono Adicional</h3>
                    <p className="text-xs text-gray-500 mt-0.5">
                      {c.producto === 'PURO'
                        ? 'Se prorratea entre las rentas restantes (cada renta baja).'
                        : 'Recalcula PMT con saldo nuevo (renta mensual baja).'}
                    </p>
                  </div>
                  <button onClick={() => setShowExtraModal(false)} className="text-gray-400 hover:text-gray-600">
                    <X size={18} />
                  </button>
                </div>

                {extraError && (
                  <div className="bg-red-50 border border-red-200 text-red-700 px-3 py-2 rounded-lg text-sm mb-3">
                    {extraError}
                  </div>
                )}

                <div className="space-y-3">
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">Monto del abono *</label>
                    <input
                      type="number"
                      value={extraMonto}
                      onChange={(e) => setExtraMonto(e.target.value)}
                      min={1}
                      step={100}
                      placeholder="0.00"
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-inyecta-500 focus:border-inyecta-500 outline-none"
                    />
                    <p className="text-[10px] text-gray-400 mt-0.5">El abono se aplica al saldo desde el primer periodo no pagado.</p>
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">Referencia bancaria</label>
                    <input
                      type="text"
                      value={extraRef}
                      onChange={(e) => setExtraRef(e.target.value)}
                      placeholder="Folio, depósito, etc."
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-inyecta-500 focus:border-inyecta-500 outline-none"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">Observaciones</label>
                    <textarea
                      value={extraObs}
                      onChange={(e) => setExtraObs(e.target.value)}
                      rows={2}
                      placeholder="Notas opcionales..."
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-inyecta-500 focus:border-inyecta-500 outline-none resize-none"
                    />
                  </div>
                </div>

                <div className="flex justify-end gap-2 mt-5">
                  <button
                    onClick={() => setShowExtraModal(false)}
                    className="px-3 py-1.5 text-sm text-gray-600 hover:text-gray-800"
                  >
                    Cancelar
                  </button>
                  <button
                    onClick={async () => {
                      await submitExtraPayment();
                      if (!extraError) setShowExtraModal(false);
                    }}
                    disabled={extraSaving || !extraMonto || Number(extraMonto) <= 0}
                    className="flex items-center gap-1.5 px-4 py-1.5 bg-violet-600 hover:bg-violet-700 disabled:bg-gray-300 text-white rounded-lg text-sm font-medium"
                  >
                    {extraSaving ? (
                      <div className="animate-spin rounded-full h-3.5 w-3.5 border-2 border-white border-t-transparent" />
                    ) : (
                      <Coins size={14} />
                    )}
                    Aplicar
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Tab: Notes */}
      {tab === 'notas' && (
        <div className="space-y-4">
          {/* New note */}
          <div className="bg-white rounded-xl border border-gray-200 p-4">
            <div className="flex gap-3">
              <div className="w-8 h-8 rounded-full bg-inyecta-600 flex items-center justify-center text-white text-xs font-medium flex-shrink-0">
                {user?.nombre?.[0]}{user?.apellidos?.[0]}
              </div>
              <div className="flex-1">
                <textarea
                  value={newNote}
                  onChange={(e) => setNewNote(e.target.value)}
                  placeholder="Agregar nota al contrato..."
                  rows={2}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-inyecta-500 focus:border-inyecta-500 outline-none resize-none"
                />
                <div className="flex justify-end mt-2">
                  <button
                    onClick={addNote}
                    disabled={!newNote.trim() || sendingNote}
                    className="flex items-center gap-1.5 px-3 py-1.5 bg-inyecta-700 text-white rounded-lg text-xs font-medium hover:bg-inyecta-800 disabled:bg-gray-300 transition-colors"
                  >
                    <Send size={12} /> Publicar
                  </button>
                </div>
              </div>
            </div>
          </div>

          {/* Notes list */}
          {c.notas.length === 0 ? (
            <p className="text-sm text-gray-400 text-center py-8">Sin notas en la bitacora</p>
          ) : (
            c.notas.map((note) => (
              <div key={note.id} className="bg-white rounded-xl border border-gray-200 p-4">
                <div className="flex items-start gap-3">
                  <div className="w-8 h-8 rounded-full bg-gray-200 flex items-center justify-center text-gray-600 text-xs font-medium flex-shrink-0">
                    {note.user.nombre?.[0]}{note.user.apellidos?.[0]}
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium text-gray-900">{note.user.nombre} {note.user.apellidos}</span>
                      <span className="text-xs text-gray-400">{formatDate(note.createdAt)}</span>
                    </div>
                    <p className="text-sm text-gray-600 mt-1">{note.contenido}</p>
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
}

function CoverageStat({
  label,
  value,
  color,
}: {
  label: string;
  value: number;
  color: 'emerald' | 'blue' | 'amber' | 'gray';
}) {
  const colorClass: Record<typeof color, string> = {
    emerald: 'text-emerald-700',
    blue: 'text-blue-700',
    amber: 'text-amber-700',
    gray: 'text-gray-500',
  };
  return (
    <div>
      <div className={`text-2xl font-bold ${colorClass[color]}`}>{value}</div>
      <div className="text-[10px] uppercase tracking-wide text-gray-500 mt-0.5">
        {label}
      </div>
    </div>
  );
}

function SummaryCard({ label, value, highlight }: { label: string; value: string; highlight?: boolean }) {
  return (
    <div className="bg-white rounded-xl border border-gray-200 p-4">
      <p className="text-xs text-gray-500">{label}</p>
      <p className={`text-base font-bold mt-1 ${highlight ? 'text-inyecta-700' : 'text-gray-900'}`}>{value}</p>
    </div>
  );
}

function InfoRow({ label, value, mono, bold, accent }: { label: string; value?: string | null; mono?: boolean; bold?: boolean; accent?: boolean }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-sm text-gray-500">{label}</span>
      <span className={`text-sm ${accent ? 'text-accent font-semibold' : bold ? 'font-semibold text-inyecta-700' : 'text-gray-900'} ${mono ? 'font-mono' : ''}`}>
        {value || '-'}
      </span>
    </div>
  );
}
