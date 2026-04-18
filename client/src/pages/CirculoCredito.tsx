import { useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import api from '@/lib/api';
import {
  AlertTriangle,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  Building2,
  User,
  FileSearch,
  Calendar,
  TrendingUp,
  Clock,
  ExternalLink,
  Info,
} from 'lucide-react';
import { cn } from '@/lib/utils';

// ─── Types ───────────────────────────────────────────────────
interface ReportePF {
  contractId: string;
  folio: string;
  producto: string;
  tipoContrato: string;
  estadoCartera: string;
  diasVencidos: number;
  saldoInsoluto: number;
  saldoVencido: number;
  pagosVencidos: number;
  historicoPagos: string;
  clientId: string;
  clienteTipo: 'PF';
  apellidoPaterno: string;
  apellidoMaterno: string;
  nombres: string;
  rfc: string;
  curp: string;
  nacionalidad: string;
  direccion: string;
  colonia: string;
  delegacionMunicipio: string;
  ciudad: string;
  estado: string;
  cp: string;
  telefono: string;
  email: string;
  cuentaActual: string;
  tipoResponsabilidad: string;
  tipoCuenta: string;
  numeroPagos: number;
  frecuenciaPagos: string;
  montoPagar: number;
  fechaApertura: string;
  fechaUltimoPago: string;
  fechaCorte: string;
  creditoMaximo: number;
  montoUltimoPago: number;
  montoCreditoOriginacion: number;
  plazoMeses: number;
  faltantes: string[];
}

interface ReportePM {
  contractId: string;
  folio: string;
  producto: string;
  tipoContrato: string;
  estadoCartera: string;
  diasVencidos: number;
  saldoInsoluto: number;
  saldoVencido: number;
  pagosVencidos: number;
  historicoPagos: string;
  clientId: string;
  clienteTipo: 'PM';
  razonSocial: string;
  rfc: string;
  representanteLegal: string;
  direccion: string;
  colonia: string;
  delegacionMunicipio: string;
  ciudad: string;
  estado: string;
  cp: string;
  telefono: string;
  email: string;
  nacionalidad: string;
  actividadEconomica: string;
  sector: string;
  numContrato: string;
  fechaApertura: string;
  plazoMeses: number;
  tipoCredito: string;
  saldoInicial: number;
  moneda: string;
  numPagos: number;
  frecuenciaPagos: string;
  importePagos: number;
  fechaUltimoPago: string;
  pagoEfectivo: number;
  creditoMaximo: number;
  socios: Array<{ nombre: string; apellidoPaterno: string; apellidoMaterno: string; rfc: string; porcentaje: number }>;
  avales: Array<{ nombre: string; apellidoPaterno: string; apellidoMaterno: string; rfc: string; curp: string; telefono: string; domicilio: string }>;
  faltantes: string[];
}

interface PreviewData {
  fechaCorte: string;
  claveOtorgante: string;
  nombreOtorgante: string;
  reportesPF: ReportePF[];
  reportesPM: ReportePM[];
  resumen: {
    totalContratos: number;
    personasFisicas: number;
    personasMorales: number;
    conDatosFaltantes: number;
    listos: number;
    faltantesDetalle: Array<{ folio: string; cliente: string; campos: string[] }>;
  };
}

// ─── Helpers ─────────────────────────────────────────────────
const fmt$ = (n: number) =>
  new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN' }).format(n);

function parseFmtDate(s: string): string {
  // YYYYMMDD → DD/MM/YYYY
  if (!s || s.length !== 8) return '—';
  return `${s.slice(6, 8)}/${s.slice(4, 6)}/${s.slice(0, 4)}`;
}

function estadoColor(estado: string) {
  if (estado === 'Vigente') return 'text-green-700 bg-green-50';
  if (estado.includes('30')) return 'text-yellow-700 bg-yellow-50';
  if (estado.includes('60')) return 'text-orange-700 bg-orange-50';
  return 'text-red-700 bg-red-50';
}

// Build list of months (last 12)
function buildPeriodos() {
  const meses = ['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'];
  const options: Array<{ label: string; value: string }> = [];
  const now = new Date();
  for (let i = 0; i < 12; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const yyyy = String(d.getFullYear());
    options.push({ label: `${meses[d.getMonth()]} ${yyyy}`, value: `${mm}${yyyy}` });
  }
  return options;
}

// ─── Row component PF ────────────────────────────────────────
function RowPF({ r, navigate }: { r: ReportePF; navigate: ReturnType<typeof useNavigate> }) {
  const [open, setOpen] = useState(false);
  const hasFaltantes = r.faltantes.length > 0;

  return (
    <div className={cn('border rounded-lg overflow-hidden', hasFaltantes ? 'border-amber-200' : 'border-gray-200')}>
      {/* Header row */}
      <button
        className={cn('w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-gray-50 transition-colors', hasFaltantes && 'bg-amber-50/40')}
        onClick={() => setOpen(v => !v)}
      >
        {open ? <ChevronDown size={16} className="text-gray-400 shrink-0" /> : <ChevronRight size={16} className="text-gray-400 shrink-0" />}
        <User size={16} className="text-blue-500 shrink-0" />
        <div className="flex-1 min-w-0">
          <span className="font-medium text-gray-900 text-sm">
            {r.apellidoPaterno} {r.apellidoMaterno} {r.nombres}
          </span>
          <span className="ml-2 text-xs text-gray-500">{r.rfc}</span>
        </div>
        <span className="text-xs text-gray-400 hidden sm:block">{r.folio}</span>
        <span className={cn('text-xs font-medium px-2 py-0.5 rounded-full mx-2', estadoColor(r.estadoCartera))}>
          {r.estadoCartera}
        </span>
        {hasFaltantes ? (
          <span className="flex items-center gap-1 text-xs text-amber-700 bg-amber-100 px-2 py-0.5 rounded-full">
            <AlertTriangle size={11} />
            {r.faltantes.length} faltante{r.faltantes.length > 1 ? 's' : ''}
          </span>
        ) : (
          <span className="flex items-center gap-1 text-xs text-green-700 bg-green-100 px-2 py-0.5 rounded-full">
            <CheckCircle2 size={11} />
            Listo
          </span>
        )}
      </button>

      {/* Expanded detail */}
      {open && (
        <div className="border-t border-gray-100 bg-white px-4 py-4">
          {hasFaltantes && (
            <div className="mb-4 p-3 bg-amber-50 border border-amber-200 rounded-lg flex items-start gap-2">
              <AlertTriangle size={16} className="text-amber-600 mt-0.5 shrink-0" />
              <div>
                <p className="text-sm font-medium text-amber-800">Campos faltantes para el reporte</p>
                <div className="flex flex-wrap gap-1.5 mt-1.5">
                  {r.faltantes.map(f => (
                    <span key={f} className="text-xs bg-amber-100 text-amber-700 px-2 py-0.5 rounded-full">{f}</span>
                  ))}
                </div>
                <button
                  onClick={() => navigate(`/clientes/${r.clientId}`)}
                  className="mt-2 flex items-center gap-1 text-xs text-amber-700 hover:text-amber-900 font-medium"
                >
                  <ExternalLink size={12} />
                  Completar en ficha de cliente
                </button>
              </div>
            </div>
          )}

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 text-sm">
            {/* Datos personales */}
            <div>
              <h4 className="font-semibold text-gray-700 mb-2 text-xs uppercase tracking-wide">Datos Personales</h4>
              <dl className="space-y-1.5">
                <FieldRow label="Apellido Paterno" value={r.apellidoPaterno} />
                <FieldRow label="Apellido Materno" value={r.apellidoMaterno} />
                <FieldRow label="Nombres" value={r.nombres} />
                <FieldRow label="RFC" value={r.rfc} />
                <FieldRow label="CURP" value={r.curp} />
                <FieldRow label="Nacionalidad" value={r.nacionalidad} />
                <FieldRow label="Teléfono" value={r.telefono} />
                <FieldRow label="Email" value={r.email} />
              </dl>
            </div>

            {/* Domicilio */}
            <div>
              <h4 className="font-semibold text-gray-700 mb-2 text-xs uppercase tracking-wide">Domicilio</h4>
              <dl className="space-y-1.5">
                <FieldRow label="Dirección" value={r.direccion} />
                <FieldRow label="Colonia" value={r.colonia} />
                <FieldRow label="Municipio" value={r.delegacionMunicipio} />
                <FieldRow label="Ciudad" value={r.ciudad} />
                <FieldRow label="Estado" value={r.estado} />
                <FieldRow label="C.P." value={r.cp} />
              </dl>
            </div>

            {/* Cuenta / Crédito */}
            <div>
              <h4 className="font-semibold text-gray-700 mb-2 text-xs uppercase tracking-wide">Datos del Crédito</h4>
              <dl className="space-y-1.5">
                <FieldRow label="No. Cuenta" value={r.cuentaActual} />
                <FieldRow label="Tipo Contrato" value={r.tipoContrato === 'CP' ? 'CP – Arrendamiento Puro' : 'PP – Arr. Financiero'} />
                <FieldRow label="Tipo Responsabilidad" value={r.tipoResponsabilidad + ' (Individual)'} />
                <FieldRow label="Plazo (meses)" value={String(r.plazoMeses)} />
                <FieldRow label="Monto Pagar" value={fmt$(r.montoPagar)} />
                <FieldRow label="Crédito Máximo" value={fmt$(r.creditoMaximo)} />
                <FieldRow label="Saldo Insoluto" value={fmt$(r.saldoInsoluto)} />
                <FieldRow label="Saldo Vencido" value={r.saldoVencido > 0 ? fmt$(r.saldoVencido) : '—'} highlight={r.saldoVencido > 0} />
                <FieldRow label="Días Vencidos" value={r.diasVencidos > 0 ? String(r.diasVencidos) : '—'} highlight={r.diasVencidos > 0} />
                <FieldRow label="Fecha Apertura" value={parseFmtDate(r.fechaApertura)} />
                <FieldRow label="Ult. Pago" value={parseFmtDate(r.fechaUltimoPago)} />
                <FieldRow label="Monto Ult. Pago" value={r.montoUltimoPago > 0 ? fmt$(r.montoUltimoPago) : '—'} />
              </dl>
            </div>
          </div>

          {/* Histórico */}
          {r.historicoPagos && (
            <div className="mt-4 pt-3 border-t border-gray-100">
              <h4 className="font-semibold text-gray-700 mb-1.5 text-xs uppercase tracking-wide">Histórico de Pagos (últimos 24 periodos)</h4>
              <div className="flex flex-wrap gap-1">
                {r.historicoPagos.split('').map((c, i) => (
                  <span key={i} className={cn('w-6 h-6 flex items-center justify-center text-xs font-mono rounded', c === 'V' ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700')}>
                    {c}
                  </span>
                ))}
              </div>
              <p className="text-xs text-gray-400 mt-1">V = Al corriente · 1 = Mora 30d · 2 = Mora 60d</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Row component PM ────────────────────────────────────────
function RowPM({ r, navigate }: { r: ReportePM; navigate: ReturnType<typeof useNavigate> }) {
  const [open, setOpen] = useState(false);
  const hasFaltantes = r.faltantes.length > 0;

  return (
    <div className={cn('border rounded-lg overflow-hidden', hasFaltantes ? 'border-amber-200' : 'border-gray-200')}>
      <button
        className={cn('w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-gray-50 transition-colors', hasFaltantes && 'bg-amber-50/40')}
        onClick={() => setOpen(v => !v)}
      >
        {open ? <ChevronDown size={16} className="text-gray-400 shrink-0" /> : <ChevronRight size={16} className="text-gray-400 shrink-0" />}
        <Building2 size={16} className="text-purple-500 shrink-0" />
        <div className="flex-1 min-w-0">
          <span className="font-medium text-gray-900 text-sm">{r.razonSocial}</span>
          <span className="ml-2 text-xs text-gray-500">{r.rfc}</span>
        </div>
        <span className="text-xs text-gray-400 hidden sm:block">{r.folio}</span>
        <span className={cn('text-xs font-medium px-2 py-0.5 rounded-full mx-2', estadoColor(r.estadoCartera))}>
          {r.estadoCartera}
        </span>
        {hasFaltantes ? (
          <span className="flex items-center gap-1 text-xs text-amber-700 bg-amber-100 px-2 py-0.5 rounded-full">
            <AlertTriangle size={11} />
            {r.faltantes.length} faltante{r.faltantes.length > 1 ? 's' : ''}
          </span>
        ) : (
          <span className="flex items-center gap-1 text-xs text-green-700 bg-green-100 px-2 py-0.5 rounded-full">
            <CheckCircle2 size={11} />
            Listo
          </span>
        )}
      </button>

      {open && (
        <div className="border-t border-gray-100 bg-white px-4 py-4">
          {hasFaltantes && (
            <div className="mb-4 p-3 bg-amber-50 border border-amber-200 rounded-lg flex items-start gap-2">
              <AlertTriangle size={16} className="text-amber-600 mt-0.5 shrink-0" />
              <div>
                <p className="text-sm font-medium text-amber-800">Campos faltantes para el reporte</p>
                <div className="flex flex-wrap gap-1.5 mt-1.5">
                  {r.faltantes.map(f => (
                    <span key={f} className="text-xs bg-amber-100 text-amber-700 px-2 py-0.5 rounded-full">{f}</span>
                  ))}
                </div>
                <button
                  onClick={() => navigate(`/clientes/${r.clientId}`)}
                  className="mt-2 flex items-center gap-1 text-xs text-amber-700 hover:text-amber-900 font-medium"
                >
                  <ExternalLink size={12} />
                  Completar en ficha de cliente
                </button>
              </div>
            </div>
          )}

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 text-sm">
            {/* Empresa */}
            <div>
              <h4 className="font-semibold text-gray-700 mb-2 text-xs uppercase tracking-wide">Empresa</h4>
              <dl className="space-y-1.5">
                <FieldRow label="Razón Social" value={r.razonSocial} />
                <FieldRow label="RFC" value={r.rfc} />
                <FieldRow label="Rep. Legal" value={r.representanteLegal} />
                <FieldRow label="Actividad Econ." value={r.actividadEconomica} />
                <FieldRow label="Sector" value={r.sector} />
                <FieldRow label="Teléfono" value={r.telefono} />
                <FieldRow label="Email" value={r.email} />
              </dl>

              {r.socios.length > 0 && (
                <>
                  <h4 className="font-semibold text-gray-700 mb-2 mt-4 text-xs uppercase tracking-wide">Accionistas</h4>
                  {r.socios.map((s, i) => (
                    <div key={i} className="text-xs text-gray-600 mb-1">
                      <span className="font-medium">{s.apellidoPaterno} {s.nombre}</span>
                      <span className="text-gray-400 ml-1">RFC: {s.rfc || '—'}</span>
                      <span className="text-gray-400 ml-1">{s.porcentaje}%</span>
                    </div>
                  ))}
                </>
              )}
            </div>

            {/* Domicilio */}
            <div>
              <h4 className="font-semibold text-gray-700 mb-2 text-xs uppercase tracking-wide">Domicilio Fiscal</h4>
              <dl className="space-y-1.5">
                <FieldRow label="Dirección" value={r.direccion} />
                <FieldRow label="Colonia" value={r.colonia} />
                <FieldRow label="Municipio" value={r.delegacionMunicipio} />
                <FieldRow label="Ciudad" value={r.ciudad} />
                <FieldRow label="Estado" value={r.estado} />
                <FieldRow label="C.P." value={r.cp} />
              </dl>

              {r.avales.length > 0 && (
                <>
                  <h4 className="font-semibold text-gray-700 mb-2 mt-4 text-xs uppercase tracking-wide">Avales</h4>
                  {r.avales.map((a, i) => (
                    <div key={i} className="text-xs text-gray-600 mb-1">
                      <span className="font-medium">{a.apellidoPaterno} {a.nombre}</span>
                      <span className="text-gray-400 ml-1">RFC: {a.rfc || '—'}</span>
                    </div>
                  ))}
                </>
              )}
            </div>

            {/* Crédito */}
            <div>
              <h4 className="font-semibold text-gray-700 mb-2 text-xs uppercase tracking-wide">Datos del Crédito</h4>
              <dl className="space-y-1.5">
                <FieldRow label="No. Contrato" value={r.numContrato} />
                <FieldRow label="Tipo Crédito" value={r.tipoCredito === '1300' ? '1300 – Arr. Puro' : `${r.tipoCredito} – Arr. Financiero`} />
                <FieldRow label="Plazo (meses)" value={String(r.plazoMeses)} />
                <FieldRow label="Saldo Inicial" value={fmt$(r.saldoInicial)} />
                <FieldRow label="Importe Pagos" value={fmt$(r.importePagos)} />
                <FieldRow label="Crédito Máximo" value={fmt$(r.creditoMaximo)} />
                <FieldRow label="Saldo Insoluto" value={fmt$(r.saldoInsoluto)} />
                <FieldRow label="Saldo Vencido" value={r.saldoVencido > 0 ? fmt$(r.saldoVencido) : '—'} highlight={r.saldoVencido > 0} />
                <FieldRow label="Días Vencidos" value={r.diasVencidos > 0 ? String(r.diasVencidos) : '—'} highlight={r.diasVencidos > 0} />
                <FieldRow label="Moneda" value={r.moneda} />
                <FieldRow label="Fecha Apertura" value={parseFmtDate(r.fechaApertura)} />
                <FieldRow label="Ult. Pago" value={parseFmtDate(r.fechaUltimoPago)} />
                <FieldRow label="Pago Efectivo" value={r.pagoEfectivo > 0 ? fmt$(r.pagoEfectivo) : '—'} />
              </dl>
            </div>
          </div>

          {r.historicoPagos && (
            <div className="mt-4 pt-3 border-t border-gray-100">
              <h4 className="font-semibold text-gray-700 mb-1.5 text-xs uppercase tracking-wide">Histórico de Pagos (últimos 24 periodos)</h4>
              <div className="flex flex-wrap gap-1">
                {r.historicoPagos.split('').map((c, i) => (
                  <span key={i} className={cn('w-6 h-6 flex items-center justify-center text-xs font-mono rounded', c === 'V' ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700')}>
                    {c}
                  </span>
                ))}
              </div>
              <p className="text-xs text-gray-400 mt-1">V = Al corriente · 1 = Mora 30d · 2 = Mora 60d</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Field row helper ─────────────────────────────────────────
function FieldRow({ label, value, highlight }: { label: string; value: string; highlight?: boolean }) {
  return (
    <div className="flex gap-1">
      <dt className="text-xs text-gray-400 w-36 shrink-0">{label}</dt>
      <dd className={cn('text-xs font-medium break-all', highlight ? 'text-red-600' : value ? 'text-gray-800' : 'text-gray-300')}>
        {value || '—'}
      </dd>
    </div>
  );
}

// ─── Main page ────────────────────────────────────────────────
const periodos = buildPeriodos();

export default function CirculoCredito() {
  const navigate = useNavigate();
  const [periodo, setPeriodo] = useState(periodos[0].value);
  const [tab, setTab] = useState<'todos' | 'pf' | 'pm'>('todos');
  const [showAlerts, setShowAlerts] = useState(true);

  const { data, isLoading, error } = useQuery<PreviewData>({
    queryKey: ['circulo-preview', periodo],
    queryFn: async () => {
      const res = await api.get(`/circulo-credito/preview?periodo=${periodo}`);
      return res.data;
    },
  });

  const allReportes = useMemo(() => {
    if (!data) return [];
    const pf = data.reportesPF.map(r => ({ ...r, _tipo: 'PF' as const }));
    const pm = data.reportesPM.map(r => ({ ...r, _tipo: 'PM' as const }));
    return [...pf, ...pm];
  }, [data]);

  const displayed = useMemo(() => {
    if (tab === 'pf') return allReportes.filter(r => r._tipo === 'PF');
    if (tab === 'pm') return allReportes.filter(r => r._tipo === 'PM');
    return allReportes;
  }, [allReportes, tab]);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="text-center">
          <div className="animate-spin w-8 h-8 border-2 border-inyecta-600 border-t-transparent rounded-full mx-auto mb-3" />
          <p className="text-sm text-gray-500">Generando reporte...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-8 text-center text-red-600">
        <p>Error al cargar los datos del reporte.</p>
        <p className="text-sm text-gray-500 mt-1">Verifica que el servidor esté corriendo.</p>
      </div>
    );
  }

  const resumen = data?.resumen;

  return (
    <div className="space-y-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Círculo de Crédito</h1>
          <p className="text-sm text-gray-500 mt-0.5">
            {data?.nombreOtorgante} · Clave: {data?.claveOtorgante}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Calendar size={16} className="text-gray-400" />
          <select
            value={periodo}
            onChange={e => setPeriodo(e.target.value)}
            className="text-sm border border-gray-200 rounded-lg px-3 py-2 bg-white focus:outline-none focus:ring-2 focus:ring-inyecta-500"
          >
            {periodos.map(p => (
              <option key={p.value} value={p.value}>{p.label}</option>
            ))}
          </select>
        </div>
      </div>

      {/* Stat cards */}
      {resumen && (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
          <StatCard
            icon={<FileSearch size={20} />}
            label="Total contratos"
            value={String(resumen.totalContratos)}
            color="blue"
          />
          <StatCard
            icon={<User size={20} />}
            label="Personas Físicas"
            value={String(resumen.personasFisicas)}
            color="indigo"
          />
          <StatCard
            icon={<Building2 size={20} />}
            label="Personas Morales"
            value={String(resumen.personasMorales)}
            color="purple"
          />
          <StatCard
            icon={<CheckCircle2 size={20} />}
            label="Listos"
            value={String(resumen.listos)}
            color="green"
          />
          <StatCard
            icon={<AlertTriangle size={20} />}
            label="Con datos faltantes"
            value={String(resumen.conDatosFaltantes)}
            color={resumen.conDatosFaltantes > 0 ? 'amber' : 'green'}
          />
        </div>
      )}

      {/* Alert section */}
      {resumen && resumen.conDatosFaltantes > 0 && (
        <div className="bg-amber-50 border border-amber-200 rounded-xl overflow-hidden">
          <button
            onClick={() => setShowAlerts(v => !v)}
            className="w-full flex items-center justify-between px-4 py-3 hover:bg-amber-100/50 transition-colors"
          >
            <div className="flex items-center gap-2">
              <AlertTriangle size={16} className="text-amber-600" />
              <span className="text-sm font-semibold text-amber-800">
                {resumen.conDatosFaltantes} contrato{resumen.conDatosFaltantes > 1 ? 's' : ''} con información incompleta
              </span>
            </div>
            {showAlerts ? <ChevronDown size={16} className="text-amber-600" /> : <ChevronRight size={16} className="text-amber-600" />}
          </button>
          {showAlerts && (
            <div className="px-4 pb-4 space-y-2">
              {resumen.faltantesDetalle.map((f, i) => (
                <div key={i} className="flex items-start gap-3 text-sm">
                  <span className="font-medium text-amber-700 w-28 shrink-0">{f.folio}</span>
                  <span className="text-amber-800 font-medium min-w-0">{f.cliente}</span>
                  <div className="flex flex-wrap gap-1 flex-1">
                    {f.campos.map(c => (
                      <span key={c} className="text-xs bg-amber-200 text-amber-800 px-1.5 py-0.5 rounded">{c}</span>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Info bar */}
      {data && (
        <div className="flex items-center gap-2 text-xs text-gray-400 bg-gray-50 rounded-lg px-4 py-2">
          <Info size={13} />
          <span>
            Fecha de corte:{' '}
            <span className="font-medium text-gray-600">
              {new Date(data.fechaCorte).toLocaleDateString('es-MX', { day: '2-digit', month: 'long', year: 'numeric' })}
            </span>
          </span>
          <span className="mx-2">·</span>
          <span>Formato CI-04-0009 (PF 99 cols) · CI-04-0010 (PM 106 cols)</span>
        </div>
      )}

      {/* Tabs */}
      <div>
        <div className="flex gap-1 bg-gray-100 p-1 rounded-xl w-fit">
          {(['todos', 'pf', 'pm'] as const).map(t => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={cn(
                'px-4 py-1.5 rounded-lg text-sm font-medium transition-colors',
                tab === t ? 'bg-white shadow-sm text-gray-900' : 'text-gray-500 hover:text-gray-700'
              )}
            >
              {t === 'todos' ? `Todos (${allReportes.length})` : t === 'pf' ? `Personas Físicas (${data?.reportesPF.length ?? 0})` : `Personas Morales (${data?.reportesPM.length ?? 0})`}
            </button>
          ))}
        </div>
      </div>

      {/* List */}
      <div className="space-y-3">
        {displayed.length === 0 ? (
          <div className="text-center py-16 text-gray-400">
            <TrendingUp size={40} className="mx-auto mb-3 opacity-30" />
            <p className="font-medium">No hay contratos para este periodo</p>
            <p className="text-sm mt-1">Selecciona otro mes o verifica que existan contratos vigentes</p>
          </div>
        ) : (
          displayed.map(r =>
            r._tipo === 'PF'
              ? <RowPF key={r.contractId} r={r as ReportePF} navigate={navigate} />
              : <RowPM key={r.contractId} r={r as ReportePM} navigate={navigate} />
          )
        )}
      </div>

      {/* Footer */}
      {displayed.length > 0 && (
        <div className="flex items-center gap-1.5 text-xs text-gray-400 pt-2">
          <Clock size={12} />
          <span>Generado el {new Date().toLocaleString('es-MX')}</span>
        </div>
      )}
    </div>
  );
}

// ─── Stat Card ───────────────────────────────────────────────
function StatCard({ icon, label, value, color }: {
  icon: React.ReactNode;
  label: string;
  value: string;
  color: 'blue' | 'indigo' | 'purple' | 'green' | 'amber';
}) {
  const colors = {
    blue:   { bg: 'bg-blue-50',   icon: 'text-blue-500',   val: 'text-blue-700' },
    indigo: { bg: 'bg-indigo-50', icon: 'text-indigo-500', val: 'text-indigo-700' },
    purple: { bg: 'bg-purple-50', icon: 'text-purple-500', val: 'text-purple-700' },
    green:  { bg: 'bg-green-50',  icon: 'text-green-500',  val: 'text-green-700' },
    amber:  { bg: 'bg-amber-50',  icon: 'text-amber-500',  val: 'text-amber-700' },
  }[color];

  return (
    <div className={cn('rounded-xl p-4', colors.bg)}>
      <div className={cn('mb-2', colors.icon)}>{icon}</div>
      <div className={cn('text-2xl font-bold', colors.val)}>{value}</div>
      <div className="text-xs text-gray-500 mt-0.5">{label}</div>
    </div>
  );
}
