/**
 * Portal del Arrendatario — vista pública para clientes finales.
 *
 * Acceso vía URL única: /portal/:token (sin login).
 * El token se imprime en su contrato y se les entrega al firmar.
 */
import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import axios from 'axios';
import { PDFDownloadLink } from '@react-pdf/renderer';
import { formatCurrency, formatDate } from '@/lib/utils';
import { EstadoCuentaPDF } from '@/lib/pdf/EstadoCuentaPDF';
import {
  Building2, FileText, AlertTriangle,
  Receipt, Download, DollarSign, ArrowRight, ArrowLeft,
  Loader2,
} from 'lucide-react';

// Cliente axios sin interceptor (la API del portal es pública)
const portalApi = axios.create({ baseURL: '/api/portal' });

interface Cliente {
  id: string;
  tipo: 'PFAE' | 'PM';
  nombre: string;
  rfc: string;
  email: string | null;
}

interface Contrato {
  id: string;
  folio: string;
  producto: string;
  plazo: number;
  rentaMensual: number;
  rentaMensualIVA: number;
  montoFinanciar: number;
  fechaInicio: string;
  fechaVencimiento: string;
  estatus: string;
  etapa: string;
}

interface Periodo {
  periodo: number;
  fechaPago: string;
  renta: number;
  ivaRenta: number;
  rentaPendiente: number;
  ivaPendiente: number;
  moratorio: number;
  ivaMoratorio: number;
  totalAdeudado: number;
  diasAtraso: number;
  // Mismo literal-union que EstadoCuentaPeriodo.estatus en lib/pdf/EstadoCuentaPDF
  // para que <EstadoCuentaPDF periodos={...} /> compile sin cast.
  // El backend (cobranza/portal) sólo emite estos cinco valores.
  estatus: 'PENDIENTE' | 'VENCIDO' | 'PAGADO' | 'PARCIAL' | 'FUTURO';
}

interface Pago {
  id: string;
  contractFolio: string;
  periodo: number | null;
  fechaPago: string;
  tipo: string;
  montoTotal: number;
  referencia: string | null;
  diasAtraso: number;
}

interface Factura {
  id: string;
  serie: string;
  folio: number;
  uuid: string | null;
  fechaTimbrado: string | null;
  status: string;
  total: number;
  contractFolio: string;
  xmlUrl: string | null;
  pdfUrl: string | null;
}

const ESTATUS_PERIODO_STYLES: Record<string, string> = {
  PAGADO:    'bg-green-100 text-green-700',
  PARCIAL:   'bg-blue-100 text-blue-700',
  VENCIDO:   'bg-red-100 text-red-700',
  PENDIENTE: 'bg-amber-100 text-amber-700',
  FUTURO:    'bg-gray-100 text-gray-600',
};

export default function Portal() {
  const { token } = useParams<{ token: string }>();

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [cliente, setCliente] = useState<Cliente | null>(null);
  const [contratos, setContratos] = useState<Contrato[]>([]);

  const [tab, setTab] = useState<'contratos' | 'pagos' | 'facturas'>('contratos');
  const [pagos, setPagos] = useState<Pago[]>([]);
  const [facturas, setFacturas] = useState<Factura[]>([]);

  const [contratoActivo, setContratoActivo] = useState<string | null>(null);
  const [contratoData, setContratoData] = useState<{ resumen: any; periodos: Periodo[]; contrato: any } | null>(null);

  // Cargar dashboard inicial
  useEffect(() => {
    if (!token) return;
    setLoading(true);
    portalApi.get(`/${token}`)
      .then(r => {
        setCliente(r.data.cliente);
        setContratos(r.data.contratos);
      })
      .catch(err => setError(err.response?.data?.error || 'Error al cargar'))
      .finally(() => setLoading(false));
  }, [token]);

  // Cargar pagos cuando se entra a esa tab
  useEffect(() => {
    if (tab === 'pagos' && pagos.length === 0 && token) {
      portalApi.get(`/${token}/payments`).then(r => setPagos(r.data.payments)).catch(() => {});
    }
    if (tab === 'facturas' && facturas.length === 0 && token) {
      portalApi.get(`/${token}/invoices`).then(r => setFacturas(r.data.invoices)).catch(() => {});
    }
  }, [tab, token]);

  // Cargar detalle del contrato seleccionado
  useEffect(() => {
    if (!contratoActivo || !token) return;
    setContratoData(null);
    portalApi.get(`/${token}/contract/${contratoActivo}`)
      .then(r => setContratoData(r.data))
      .catch(() => {});
  }, [contratoActivo, token]);

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <Loader2 className="animate-spin text-inyecta-600" size={32} />
      </div>
    );
  }

  if (error || !cliente) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center px-4">
        <div className="bg-white rounded-lg shadow-lg p-8 max-w-md text-center">
          <AlertTriangle className="mx-auto text-red-500 mb-4" size={48} />
          <h1 className="text-xl font-bold text-gray-900 mb-2">Acceso no válido</h1>
          <p className="text-gray-600">{error || 'El token proporcionado no es válido.'}</p>
          <p className="text-sm text-gray-400 mt-4">
            Si recibió este enlace en su contrato y cree que es un error, contacte a Inyecta SOFOM.
          </p>
        </div>
      </div>
    );
  }

  // Vista de contrato individual
  if (contratoActivo && contratoData) {
    const { contrato, resumen, periodos } = contratoData;
    return (
      <div className="min-h-screen bg-gray-50">
        <Header cliente={cliente} />
        <div className="max-w-6xl mx-auto p-4 lg:p-6">
          <button
            onClick={() => { setContratoActivo(null); setContratoData(null); }}
            className="text-sm text-inyecta-600 hover:text-inyecta-800 inline-flex items-center gap-1 mb-4"
          >
            <ArrowLeft size={14} /> Volver a contratos
          </button>

          <div className="bg-white rounded-lg border border-gray-200 p-6 mb-4">
            <div className="flex items-start justify-between flex-wrap gap-3">
              <div>
                <div className="text-xs text-gray-500 uppercase font-semibold">{contrato.producto}</div>
                <h1 className="text-2xl font-bold text-gray-900">Contrato {contrato.folio}</h1>
                <div className="text-sm text-gray-500 mt-1">
                  Plazo: {contrato.plazo} meses · Tasa anual: {(contrato.tasaAnual * 100).toFixed(2)}%
                </div>
              </div>
              <div className="text-right">
                <div className="text-xs text-gray-500 uppercase font-semibold">Renta mensual</div>
                <div className="text-2xl font-bold text-inyecta-700">{formatCurrency(contrato.rentaMensualIVA)}</div>
                <div className="text-xs text-gray-400">IVA incluido</div>
              </div>
            </div>
          </div>

          {/* Resumen */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
            <div className="bg-white p-4 rounded-lg border border-red-200">
              <div className="text-xs text-red-700 uppercase font-semibold">Total adeudado</div>
              <div className="text-2xl font-bold text-red-700 mt-1">{formatCurrency(resumen.totalAdeudado)}</div>
              <div className="text-xs text-gray-500 mt-1">{resumen.periodosVencidos} periodos vencidos</div>
            </div>
            <div className="bg-white p-4 rounded-lg border border-gray-200">
              <div className="text-xs text-gray-500 uppercase font-semibold">Próximo pago</div>
              {resumen.proximoPago ? (
                <>
                  <div className="text-2xl font-bold text-gray-900 mt-1">{formatCurrency(resumen.proximoPago.monto)}</div>
                  <div className="text-xs text-gray-500 mt-1">
                    Periodo {resumen.proximoPago.periodo} · {formatDate(resumen.proximoPago.fecha)}
                  </div>
                </>
              ) : (
                <div className="text-2xl font-bold text-green-700 mt-1">Al corriente</div>
              )}
            </div>
            <div className="bg-white p-4 rounded-lg border border-gray-200">
              <div className="text-xs text-gray-500 uppercase font-semibold">Estatus contrato</div>
              <div className="text-xl font-bold text-gray-900 mt-1">{contrato.estatus}</div>
              <div className="text-xs text-gray-500 mt-1">
                Vence {formatDate(contrato.fechaVencimiento)}
              </div>
            </div>
          </div>

          {/* Tabla de periodos */}
          <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
            <div className="px-4 py-3 border-b bg-gray-50 flex items-center justify-between gap-2 flex-wrap">
              <h2 className="font-semibold text-gray-900">Calendario de pagos</h2>
              <PDFDownloadLink
                document={
                  <EstadoCuentaPDF
                    cliente={{ nombre: cliente.nombre, rfc: cliente.rfc, email: cliente.email }}
                    contrato={contrato}
                    resumen={resumen}
                    periodos={periodos}
                  />
                }
                fileName={`estado-cuenta-${contrato.folio}.pdf`}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-inyecta-600 hover:bg-inyecta-700 text-white text-sm font-medium transition-colors"
              >
                {({ loading }) => (
                  <>
                    {loading ? <Loader2 className="animate-spin" size={14} /> : <Download size={14} />}
                    {loading ? 'Generando…' : 'Descargar estado de cuenta'}
                  </>
                )}
              </PDFDownloadLink>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 text-xs uppercase text-gray-500 border-b">
                  <tr>
                    <th className="px-3 py-2 text-left">Periodo</th>
                    <th className="px-3 py-2 text-left">Vence</th>
                    <th className="px-3 py-2 text-right">Renta</th>
                    <th className="px-3 py-2 text-right">IVA</th>
                    <th className="px-3 py-2 text-right">Moratorio</th>
                    <th className="px-3 py-2 text-right">Por pagar</th>
                    <th className="px-3 py-2 text-center">Estatus</th>
                  </tr>
                </thead>
                <tbody>
                  {periodos.map(p => (
                    <tr key={p.periodo} className="border-b last:border-0 hover:bg-gray-50">
                      <td className="px-3 py-2 font-medium">{p.periodo}</td>
                      <td className="px-3 py-2">
                        {formatDate(p.fechaPago)}
                        {p.diasAtraso > 0 && (
                          <span className="text-red-600 text-xs block">{p.diasAtraso} días vencido</span>
                        )}
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums">{formatCurrency(p.renta)}</td>
                      <td className="px-3 py-2 text-right tabular-nums text-gray-500">{formatCurrency(p.ivaRenta)}</td>
                      <td className="px-3 py-2 text-right tabular-nums text-red-600">
                        {p.moratorio > 0 ? formatCurrency(p.moratorio + p.ivaMoratorio) : '—'}
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums font-semibold">
                        {p.totalAdeudado > 0 ? formatCurrency(p.totalAdeudado) : '—'}
                      </td>
                      <td className="px-3 py-2 text-center">
                        <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-medium ${ESTATUS_PERIODO_STYLES[p.estatus]}`}>
                          {p.estatus}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <DatosBancarios />
        </div>
      </div>
    );
  }

  // Vista de dashboard
  return (
    <div className="min-h-screen bg-gray-50">
      <Header cliente={cliente} />

      <div className="max-w-6xl mx-auto p-4 lg:p-6 space-y-6">
        {/* Tabs */}
        <div className="bg-white rounded-lg border border-gray-200 flex gap-1 p-1">
          {[
            { id: 'contratos', label: 'Mis Contratos', icon: FileText, count: contratos.length },
            { id: 'pagos', label: 'Historial de Pagos', icon: DollarSign, count: pagos.length },
            { id: 'facturas', label: 'Mis Facturas', icon: Receipt, count: facturas.length },
          ].map(t => (
            <button
              key={t.id}
              onClick={() => setTab(t.id as any)}
              className={`flex-1 flex items-center justify-center gap-2 px-3 py-2 rounded-md text-sm font-medium transition-colors ${
                tab === t.id
                  ? 'bg-inyecta-50 text-inyecta-700'
                  : 'text-gray-600 hover:bg-gray-50'
              }`}
            >
              <t.icon size={16} />
              {t.label}
              {t.count > 0 && (
                <span className={`text-xs px-1.5 py-0.5 rounded-full ${
                  tab === t.id ? 'bg-inyecta-200 text-inyecta-800' : 'bg-gray-200 text-gray-600'
                }`}>{t.count}</span>
              )}
            </button>
          ))}
        </div>

        {/* Tab content */}
        {tab === 'contratos' && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {contratos.length === 0 ? (
              <div className="md:col-span-2 bg-white p-8 rounded-lg border border-gray-200 text-center text-gray-500">
                No tiene contratos activos.
              </div>
            ) : contratos.map(c => (
              <button
                key={c.id}
                onClick={() => setContratoActivo(c.id)}
                className="bg-white p-5 rounded-lg border border-gray-200 hover:border-inyecta-400 hover:shadow-md transition-all text-left"
              >
                <div className="flex items-start justify-between mb-3">
                  <div>
                    <div className="text-xs text-gray-500 uppercase font-semibold">{c.producto}</div>
                    <div className="text-lg font-bold text-gray-900">{c.folio}</div>
                  </div>
                  <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                    c.estatus === 'VIGENTE' ? 'bg-green-100 text-green-700' :
                    c.estatus === 'VENCIDO' ? 'bg-red-100 text-red-700' :
                    'bg-gray-100 text-gray-700'
                  }`}>{c.estatus}</span>
                </div>
                <div className="grid grid-cols-2 gap-3 text-sm">
                  <div>
                    <div className="text-xs text-gray-500">Renta mensual</div>
                    <div className="font-semibold text-inyecta-700">{formatCurrency(c.rentaMensualIVA)}</div>
                  </div>
                  <div>
                    <div className="text-xs text-gray-500">Plazo</div>
                    <div className="font-semibold">{c.plazo} meses</div>
                  </div>
                  <div>
                    <div className="text-xs text-gray-500">Inicio</div>
                    <div>{formatDate(c.fechaInicio)}</div>
                  </div>
                  <div>
                    <div className="text-xs text-gray-500">Vence</div>
                    <div>{formatDate(c.fechaVencimiento)}</div>
                  </div>
                </div>
                <div className="mt-3 pt-3 border-t border-gray-100 text-xs text-inyecta-600 inline-flex items-center gap-1">
                  Ver detalle <ArrowRight size={12} />
                </div>
              </button>
            ))}
          </div>
        )}

        {tab === 'pagos' && (
          <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 text-xs uppercase text-gray-500 border-b">
                  <tr>
                    <th className="px-3 py-2 text-left">Fecha</th>
                    <th className="px-3 py-2 text-left">Contrato</th>
                    <th className="px-3 py-2 text-left">Tipo</th>
                    <th className="px-3 py-2 text-left">Periodo</th>
                    <th className="px-3 py-2 text-left">Referencia</th>
                    <th className="px-3 py-2 text-right">Monto</th>
                  </tr>
                </thead>
                <tbody>
                  {pagos.length === 0 ? (
                    <tr><td colSpan={6} className="text-center py-8 text-gray-500">No hay pagos registrados</td></tr>
                  ) : pagos.map(p => (
                    <tr key={p.id} className="border-b last:border-0 hover:bg-gray-50">
                      <td className="px-3 py-2">{formatDate(p.fechaPago)}</td>
                      <td className="px-3 py-2 font-medium">{p.contractFolio}</td>
                      <td className="px-3 py-2 text-xs text-gray-500">{p.tipo}</td>
                      <td className="px-3 py-2">{p.periodo ?? '—'}</td>
                      <td className="px-3 py-2 text-xs text-gray-500">{p.referencia || '—'}</td>
                      <td className="px-3 py-2 text-right tabular-nums font-semibold text-green-700">
                        {formatCurrency(p.montoTotal)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {tab === 'facturas' && (
          <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 text-xs uppercase text-gray-500 border-b">
                  <tr>
                    <th className="px-3 py-2 text-left">Folio</th>
                    <th className="px-3 py-2 text-left">Fecha</th>
                    <th className="px-3 py-2 text-left">Contrato</th>
                    <th className="px-3 py-2 text-left">Estatus</th>
                    <th className="px-3 py-2 text-right">Total</th>
                    <th className="px-3 py-2 text-center">XML</th>
                  </tr>
                </thead>
                <tbody>
                  {facturas.length === 0 ? (
                    <tr><td colSpan={6} className="text-center py-8 text-gray-500">Aún no se han emitido facturas</td></tr>
                  ) : facturas.map(f => (
                    <tr key={f.id} className="border-b last:border-0 hover:bg-gray-50">
                      <td className="px-3 py-2 font-semibold">{f.serie}-{f.folio}</td>
                      <td className="px-3 py-2">{f.fechaTimbrado ? formatDate(f.fechaTimbrado) : '—'}</td>
                      <td className="px-3 py-2">{f.contractFolio}</td>
                      <td className="px-3 py-2">
                        <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                          f.status === 'TIMBRADO' ? 'bg-green-100 text-green-700' :
                          f.status === 'CANCELADO' ? 'bg-red-100 text-red-700' :
                          'bg-gray-100 text-gray-700'
                        }`}>{f.status}</span>
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums font-semibold">{formatCurrency(f.total)}</td>
                      <td className="px-3 py-2 text-center">
                        {f.xmlUrl && (
                          <a href={f.xmlUrl} target="_blank" rel="noopener noreferrer"
                             className="text-inyecta-600 hover:text-inyecta-800 inline-flex items-center gap-1 text-xs">
                            <Download size={12} /> XML
                          </a>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function Header({ cliente }: { cliente: Cliente }) {
  return (
    <header className="bg-inyecta-900 text-white shadow">
      <div className="max-w-6xl mx-auto px-4 py-4 lg:px-6 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-accent rounded-lg flex items-center justify-center font-bold text-white">
            IN
          </div>
          <div>
            <div className="font-semibold">Inyecta Arrendamiento</div>
            <div className="text-xs text-inyecta-300">Portal del Arrendatario</div>
          </div>
        </div>
        <div className="text-right">
          <div className="text-sm font-medium">{cliente.nombre}</div>
          <div className="text-xs text-inyecta-300 font-mono">{cliente.rfc}</div>
        </div>
      </div>
    </header>
  );
}

function DatosBancarios() {
  return (
    <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mt-4">
      <h3 className="font-semibold text-blue-900 mb-2 flex items-center gap-2">
        <Building2 size={16} /> Datos para depósito o transferencia
      </h3>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-sm">
        <div>
          <div className="text-xs text-blue-700">Beneficiario</div>
          <div className="font-medium text-blue-900">FSMP Soluciones de Capital S.A. de C.V.</div>
        </div>
        <div>
          <div className="text-xs text-blue-700">Banco</div>
          <div className="font-medium text-blue-900">BBVA México</div>
        </div>
        <div>
          <div className="text-xs text-blue-700">CLABE</div>
          <div className="font-mono font-medium text-blue-900">012-180-XXXXXXXXXX-X</div>
        </div>
      </div>
      <p className="text-xs text-blue-700 mt-3">
        Por favor incluya su folio de contrato como referencia. Su pago se reflejará en el portal en máximo 24 horas hábiles.
      </p>
    </div>
  );
}
