import { useState, useEffect, useMemo } from 'react';
import { useNavigate, useSearchParams, Link } from 'react-router-dom';
import api from '@/lib/api';
import { formatCurrency } from '@/lib/utils';
import { ArrowLeft, Save, Building2, User, Search, Calculator, FileText } from 'lucide-react';

interface ClientOption {
  id: string;
  tipo: 'PFAE' | 'PM';
  nombre?: string;
  apellidoPaterno?: string;
  razonSocial?: string;
  rfc?: string;
}

const RISK_PRESETS: Record<string, { enganche: number; deposito: number }> = {
  A: { enganche: 0, deposito: 0.16 },
  B: { enganche: 0.10, deposito: 0.21 },
  C: { enganche: 0.20, deposito: 0.26 },
};

function clientDisplayName(c: ClientOption): string {
  if (c.tipo === 'PM') return c.razonSocial || 'Sin nombre';
  return [c.nombre, c.apellidoPaterno].filter(Boolean).join(' ') || 'Sin nombre';
}

export default function ContratoNuevo() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const preClientId = searchParams.get('clientId');
  const preQuotationId = searchParams.get('quotationId');

  const [clients, setClients] = useState<ClientOption[]>([]);
  const [clientSearch, setClientSearch] = useState('');
  const [selectedClient, setSelectedClient] = useState<ClientOption | null>(null);
  const [showClientDropdown, setShowClientDropdown] = useState(false);
  const [prefillFolio, setPrefillFolio] = useState<string>('');

  const [producto, setProducto] = useState<'PURO' | 'FINANCIERO'>('PURO');
  const [nivelRiesgo, setNivelRiesgo] = useState<'A' | 'B' | 'C'>('A');
  const [valorBien, setValorBien] = useState<number>(0);
  const [plazo, setPlazo] = useState<number>(24);
  const [tasaAnual, setTasaAnual] = useState<number>(0.36);
  const [bienDescripcion, setBienDescripcion] = useState('');
  const [bienMarca, setBienMarca] = useState('');
  const [bienModelo, setBienModelo] = useState('');
  const [bienAnio, setBienAnio] = useState<string>('');
  const [bienNumSerie, setBienNumSerie] = useState('');
  const [bienEstado, setBienEstado] = useState('Nuevo');
  const [proveedor, setProveedor] = useState('');
  const [comisionAperturaPct, setComisionAperturaPct] = useState(0.05);
  const [gpsInstalacion, setGpsInstalacion] = useState(3500);
  const [seguroAnual, setSeguroAnual] = useState(0);
  const [valorResidualPct, setValorResidualPct] = useState(0.01);
  const [rentaInicial, setRentaInicial] = useState(0);

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  // Fetch clients (and resolver de cliente preseleccionado)
  useEffect(() => {
    api.get('/clients?limit=200')
      .then((res) => {
        setClients(res.data.data);
        if (preClientId) {
          const found = res.data.data.find((c: ClientOption) => c.id === preClientId);
          if (found) setSelectedClient(found);
        }
      })
      .catch(() => {});
  }, [preClientId]);

  // Prefill desde cotización
  useEffect(() => {
    if (!preQuotationId) return;
    api.get(`/quotations/${preQuotationId}`)
      .then((res) => {
        const q = res.data;
        setPrefillFolio(q.folio || '');
        if (q.producto) setProducto(q.producto);
        if (q.nivelRiesgo) setNivelRiesgo(q.nivelRiesgo);
        if (q.valorBien) setValorBien(Number(q.valorBien));
        if (q.plazo) setPlazo(q.plazo);
        if (q.tasaAnual) setTasaAnual(Number(q.tasaAnual));
        if (q.bienDescripcion) setBienDescripcion(q.bienDescripcion);
        if (q.bienMarca) setBienMarca(q.bienMarca);
        if (q.bienModelo) setBienModelo(q.bienModelo);
        if (q.bienAnio) setBienAnio(String(q.bienAnio));
        if (q.bienNumSerie) setBienNumSerie(q.bienNumSerie);
        setBienEstado(q.bienNuevo === false ? 'Seminuevo' : 'Nuevo');
        if (q.comisionAperturaPct != null) setComisionAperturaPct(Number(q.comisionAperturaPct));
        if (q.gpsInstalacion != null) setGpsInstalacion(Number(q.gpsInstalacion));
        if (q.seguroAnual != null) setSeguroAnual(Number(q.seguroAnual));
        if (q.valorResidualPct != null) setValorResidualPct(Number(q.valorResidualPct));
        if (q.rentaInicial != null) setRentaInicial(Number(q.rentaInicial));
        if (q.clientId && !preClientId) {
          // resolver el cliente cuando los clientes ya cargaron
          api.get(`/clients/${q.clientId}`)
            .then((c) => setSelectedClient(c.data))
            .catch(() => {});
        }
      })
      .catch(() => setError('No se pudo cargar la cotización para prefill'));
  }, [preQuotationId, preClientId]);

  const filteredClients = useMemo(() => {
    if (!clientSearch) return clients;
    const q = clientSearch.toLowerCase();
    return clients.filter((c) =>
      clientDisplayName(c).toLowerCase().includes(q) ||
      (c.rfc || '').toLowerCase().includes(q)
    );
  }, [clients, clientSearch]);

  // Financial calculations
  const preset = RISK_PRESETS[nivelRiesgo];
  const enganche = valorBien * preset.enganche;
  const depositoGarantia = valorBien * preset.deposito;
  const comisionApertura = valorBien * comisionAperturaPct;
  const valorResidual = valorBien * valorResidualPct;

  const baseFinanciar = valorBien - enganche + comisionApertura + gpsInstalacion;
  const montoFinanciar = baseFinanciar > 0 ? baseFinanciar : 0;

  // PMT calculation
  const tasaMensual = tasaAnual / 12;
  const rentaMensual = useMemo(() => {
    if (montoFinanciar <= 0 || plazo <= 0) return 0;
    if (tasaMensual === 0) return montoFinanciar / plazo;
    const pmt = (montoFinanciar * tasaMensual * Math.pow(1 + tasaMensual, plazo)) /
                (Math.pow(1 + tasaMensual, plazo) - 1);
    return Math.round(pmt * 100) / 100;
  }, [montoFinanciar, plazo, tasaMensual]);

  const rentaMensualIVA = Math.round(rentaMensual * 1.16 * 100) / 100;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedClient) {
      setError('Debes seleccionar un cliente');
      return;
    }
    if (!bienDescripcion.trim()) {
      setError('La descripcion del bien es requerida');
      return;
    }
    if (valorBien < 150000) {
      setError('El valor del bien debe ser minimo $150,000');
      return;
    }
    setSaving(true);
    setError('');
    try {
      const res = await api.post('/contracts', {
        clientId: selectedClient.id,
        quotationId: preQuotationId || undefined,
        producto,
        nivelRiesgo,
        valorBien,
        plazo,
        tasaAnual,
        bienDescripcion: bienDescripcion.trim(),
        bienMarca: bienMarca || undefined,
        bienModelo: bienModelo || undefined,
        bienAnio: bienAnio ? parseInt(bienAnio) : undefined,
        bienNumSerie: bienNumSerie || undefined,
        bienEstado: bienEstado || undefined,
        proveedor: proveedor || undefined,
        enganche,
        depositoGarantia,
        comisionApertura,
        rentaInicial,
        gpsInstalacion,
        seguroAnual,
        valorResidual,
        montoFinanciar,
        rentaMensual,
        rentaMensualIVA,
      });
      navigate(`/contratos/${res.data.id}`);
    } catch (err: any) {
      const msg = err.response?.data?.error;
      if (typeof msg === 'string') setError(msg);
      else if (Array.isArray(msg)) setError(msg.map((e: any) => e.message).join(', '));
      else setError('Error al crear contrato');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="max-w-3xl mx-auto">
      <div className="flex items-center gap-3 mb-6">
        <Link to="/contratos" className="text-gray-400 hover:text-gray-600">
          <ArrowLeft size={20} />
        </Link>
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Nuevo Contrato</h1>
          <p className="text-gray-500 text-sm">Crear contrato de arrendamiento</p>
        </div>
      </div>

      {prefillFolio && (
        <div className="bg-violet-50 border border-violet-200 text-violet-800 px-4 py-3 rounded-lg text-sm mb-4 flex items-start gap-2">
          <FileText size={16} className="mt-0.5 flex-shrink-0" />
          <div>
            <strong>Datos prellenados</strong> desde la cotización{' '}
            <Link to={`/cotizaciones/${preQuotationId}`} className="font-mono font-medium underline">
              {prefillFolio}
            </Link>
            . Al guardar, la cotización se marcará como CONVERTIDA.
          </div>
        </div>
      )}

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg text-sm mb-4">
          {error}
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-6">
        {/* Client selector */}
        <div className="bg-white rounded-xl border border-gray-200 p-6">
          <h3 className="font-semibold text-gray-900 mb-4">Cliente</h3>
          {selectedClient ? (
            <div className="flex items-center justify-between p-3 rounded-lg border-2 border-inyecta-200 bg-inyecta-50">
              <div className="flex items-center gap-3">
                <div className={`w-8 h-8 rounded-full flex items-center justify-center text-white text-xs ${
                  selectedClient.tipo === 'PM' ? 'bg-blue-500' : 'bg-emerald-500'
                }`}>
                  {selectedClient.tipo === 'PM' ? <Building2 size={14} /> : <User size={14} />}
                </div>
                <div>
                  <p className="font-medium text-gray-900 text-sm">{clientDisplayName(selectedClient)}</p>
                  <p className="text-xs text-gray-500">{selectedClient.rfc || 'Sin RFC'} · {selectedClient.tipo}</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setSelectedClient(null)}
                className="text-xs text-gray-500 hover:text-gray-700"
              >
                Cambiar
              </button>
            </div>
          ) : (
            <div className="relative">
              <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
              <input
                type="text"
                placeholder="Buscar cliente por nombre o RFC..."
                value={clientSearch}
                onChange={(e) => { setClientSearch(e.target.value); setShowClientDropdown(true); }}
                onFocus={() => setShowClientDropdown(true)}
                className="w-full pl-9 pr-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-inyecta-500 focus:border-inyecta-500 outline-none"
              />
              {showClientDropdown && (
                <div className="absolute z-20 top-full left-0 right-0 mt-1 bg-white border border-gray-200 rounded-lg shadow-lg max-h-48 overflow-y-auto">
                  {filteredClients.length === 0 ? (
                    <div className="p-3 text-sm text-gray-400 text-center">
                      Sin resultados.{' '}
                      <Link to="/clientes/nuevo" className="text-inyecta-600 hover:underline">Crear cliente</Link>
                    </div>
                  ) : (
                    filteredClients.map((c) => (
                      <button
                        key={c.id}
                        type="button"
                        onClick={() => {
                          setSelectedClient(c);
                          setShowClientDropdown(false);
                          setClientSearch('');
                        }}
                        className="w-full flex items-center gap-3 px-3 py-2 hover:bg-gray-50 text-left"
                      >
                        {c.tipo === 'PM' ? <Building2 size={12} className="text-blue-400" /> : <User size={12} className="text-emerald-400" />}
                        <span className="text-sm text-gray-900">{clientDisplayName(c)}</span>
                        <span className="text-xs text-gray-400 ml-auto font-mono">{c.rfc || ''}</span>
                      </button>
                    ))
                  )}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Product type & risk */}
        <div className="bg-white rounded-xl border border-gray-200 p-6">
          <h3 className="font-semibold text-gray-900 mb-4">Producto y Riesgo</h3>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-600 mb-2">Tipo de Arrendamiento</label>
              <div className="flex gap-2">
                {(['PURO', 'FINANCIERO'] as const).map((p) => (
                  <button
                    key={p}
                    type="button"
                    onClick={() => setProducto(p)}
                    className={`flex-1 px-3 py-2 rounded-lg border-2 text-sm font-medium transition-colors ${
                      producto === p
                        ? p === 'PURO' ? 'border-cyan-300 bg-cyan-50 text-cyan-700' : 'border-violet-300 bg-violet-50 text-violet-700'
                        : 'border-gray-200 text-gray-500 hover:border-gray-300'
                    }`}
                  >
                    {p === 'PURO' ? 'Puro' : 'Financiero'}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-600 mb-2">Nivel de Riesgo</label>
              <div className="flex gap-2">
                {(['A', 'B', 'C'] as const).map((r) => (
                  <button
                    key={r}
                    type="button"
                    onClick={() => setNivelRiesgo(r)}
                    className={`flex-1 px-3 py-2 rounded-lg border-2 text-sm font-medium transition-colors ${
                      nivelRiesgo === r
                        ? 'border-inyecta-300 bg-inyecta-50 text-inyecta-700'
                        : 'border-gray-200 text-gray-500 hover:border-gray-300'
                    }`}
                  >
                    {r}
                    <span className="block text-[10px] font-normal mt-0.5">
                      {r === 'A' ? 'Bajo' : r === 'B' ? 'Medio' : 'Alto'}
                    </span>
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* Asset details */}
        <div className="bg-white rounded-xl border border-gray-200 p-6">
          <h3 className="font-semibold text-gray-900 mb-4">Datos del Bien</h3>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <div className="lg:col-span-2">
              <label className="block text-sm font-medium text-gray-600 mb-1">Descripcion del Bien *</label>
              <input
                type="text"
                value={bienDescripcion}
                onChange={(e) => setBienDescripcion(e.target.value)}
                placeholder="Ej: Camion Freightliner Cascadia 2025"
                required
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-inyecta-500 focus:border-inyecta-500 outline-none"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-600 mb-1">Marca</label>
              <input type="text" value={bienMarca} onChange={(e) => setBienMarca(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-inyecta-500 focus:border-inyecta-500 outline-none" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-600 mb-1">Modelo</label>
              <input type="text" value={bienModelo} onChange={(e) => setBienModelo(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-inyecta-500 focus:border-inyecta-500 outline-none" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-600 mb-1">Año</label>
              <input type="number" value={bienAnio} onChange={(e) => setBienAnio(e.target.value)} min={2000} max={2030}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-inyecta-500 focus:border-inyecta-500 outline-none" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-600 mb-1">No. de Serie</label>
              <input type="text" value={bienNumSerie} onChange={(e) => setBienNumSerie(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm font-mono focus:ring-2 focus:ring-inyecta-500 focus:border-inyecta-500 outline-none" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-600 mb-1">Estado</label>
              <select value={bienEstado} onChange={(e) => setBienEstado(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-inyecta-500 focus:border-inyecta-500 outline-none">
                <option value="Nuevo">Nuevo</option>
                <option value="Seminuevo">Seminuevo</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-600 mb-1">Proveedor</label>
              <input type="text" value={proveedor} onChange={(e) => setProveedor(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-inyecta-500 focus:border-inyecta-500 outline-none" />
            </div>
          </div>
        </div>

        {/* Financial parameters */}
        <div className="bg-white rounded-xl border border-gray-200 p-6">
          <h3 className="font-semibold text-gray-900 mb-4">Parametros Financieros</h3>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-600 mb-1">Valor del Bien (sin IVA) *</label>
              <input
                type="number"
                value={valorBien || ''}
                onChange={(e) => setValorBien(Number(e.target.value))}
                min={150000}
                step={1000}
                required
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-inyecta-500 focus:border-inyecta-500 outline-none"
              />
              <p className="text-[10px] text-gray-400 mt-0.5">Minimo: $150,000 MXN</p>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-600 mb-1">Plazo (meses)</label>
              <select value={plazo} onChange={(e) => setPlazo(Number(e.target.value))}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-inyecta-500 focus:border-inyecta-500 outline-none">
                {[12, 18, 24, 30, 36, 42, 48].map((p) => (
                  <option key={p} value={p}>{p} meses</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-600 mb-1">Tasa Anual</label>
              <input type="number" value={tasaAnual} onChange={(e) => setTasaAnual(Number(e.target.value))}
                step={0.01} min={0.01} max={1}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-inyecta-500 focus:border-inyecta-500 outline-none" />
              <p className="text-[10px] text-gray-400 mt-0.5">{(tasaAnual * 100).toFixed(0)}% anual</p>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-600 mb-1">Comision Apertura</label>
              <input type="number" value={comisionAperturaPct} onChange={(e) => setComisionAperturaPct(Number(e.target.value))}
                step={0.01} min={0} max={0.2}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-inyecta-500 focus:border-inyecta-500 outline-none" />
              <p className="text-[10px] text-gray-400 mt-0.5">{(comisionAperturaPct * 100).toFixed(0)}% = {formatCurrency(comisionApertura)}</p>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-600 mb-1">GPS Instalacion</label>
              <input type="number" value={gpsInstalacion} onChange={(e) => setGpsInstalacion(Number(e.target.value))}
                step={500} min={0}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-inyecta-500 focus:border-inyecta-500 outline-none" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-600 mb-1">Seguro Anual</label>
              <input type="number" value={seguroAnual} onChange={(e) => setSeguroAnual(Number(e.target.value))}
                step={500} min={0}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-inyecta-500 focus:border-inyecta-500 outline-none" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-600 mb-1">Valor Residual (%)</label>
              <input type="number" value={valorResidualPct} onChange={(e) => setValorResidualPct(Number(e.target.value))}
                step={0.01} min={0} max={1}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-inyecta-500 focus:border-inyecta-500 outline-none" />
              <p className="text-[10px] text-gray-400 mt-0.5">{(valorResidualPct * 100).toFixed(0)}% = {formatCurrency(valorResidual)}</p>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-600 mb-1">Renta Inicial</label>
              <input type="number" value={rentaInicial} onChange={(e) => setRentaInicial(Number(e.target.value))}
                step={500} min={0}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-inyecta-500 focus:border-inyecta-500 outline-none" />
            </div>
          </div>
        </div>

        {/* Summary */}
        {valorBien >= 150000 && (
          <div className="bg-inyecta-50 rounded-xl border border-inyecta-200 p-6">
            <div className="flex items-center gap-2 mb-4">
              <Calculator size={18} className="text-inyecta-700" />
              <h3 className="font-semibold text-inyecta-900">Resumen Calculado</h3>
            </div>
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
              <div>
                <p className="text-xs text-inyecta-600">Enganche ({(preset.enganche * 100).toFixed(0)}%)</p>
                <p className="font-bold text-gray-900">{formatCurrency(enganche)}</p>
              </div>
              <div>
                <p className="text-xs text-inyecta-600">Deposito Garantia ({(preset.deposito * 100).toFixed(0)}%)</p>
                <p className="font-bold text-gray-900">{formatCurrency(depositoGarantia)}</p>
              </div>
              <div>
                <p className="text-xs text-inyecta-600">Monto a Financiar</p>
                <p className="font-bold text-gray-900">{formatCurrency(montoFinanciar)}</p>
              </div>
              <div>
                <p className="text-xs text-inyecta-600">Renta Mensual + IVA</p>
                <p className="font-bold text-inyecta-700 text-lg">{formatCurrency(rentaMensualIVA)}</p>
              </div>
            </div>
          </div>
        )}

        {/* Submit */}
        <button
          type="submit"
          disabled={saving || !selectedClient || valorBien < 150000}
          className="w-full bg-inyecta-700 hover:bg-inyecta-800 disabled:bg-inyecta-400 text-white py-3 rounded-xl text-sm font-medium flex items-center justify-center gap-2 transition-colors"
        >
          {saving ? (
            <div className="animate-spin rounded-full h-4 w-4 border-2 border-white border-t-transparent" />
          ) : (
            <><Save size={16} /> Crear Contrato</>
          )}
        </button>
      </form>
    </div>
  );
}
