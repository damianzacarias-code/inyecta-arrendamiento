import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '@/lib/api';
import { formatCurrency, formatPercent } from '@/lib/utils';
import { Calculator, Save, FileDown, RotateCcw, ChevronDown, ChevronUp } from 'lucide-react';

interface SimulationResult {
  resultado: {
    valorBienIVA: number;
    enganche: number;
    depositoGarantia: number;
    comisionApertura: number;
    montoFinanciar: number;
    rentaMensual: number;
    rentaMensualIVA: number;
    valorResidual: number;
    totalRentas: number;
    totalPagar: number;
    ganancia: number;
    amortizacion: Array<{
      periodo: number;
      saldoInicial: number;
      capital: number;
      interes: number;
      renta: number;
      iva: number;
      rentaConIVA: number;
      saldoFinal: number;
    }>;
  };
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
}

interface AssetCategory {
  id: string;
  nombre: string;
  requiereGPS: boolean;
}

const defaultForm = {
  nombreCliente: '',
  producto: 'PURO' as 'PURO' | 'FINANCIERO',
  valorBien: 500000,
  plazo: 36,
  tasaAnual: 0.36,
  nivelRiesgo: 'A' as 'A' | 'B' | 'C',
  enganchePct: 0,
  depositoGarantiaPct: 0.16,
  comisionAperturaPct: 0.05,
  comisionAperturaFinanciada: true,
  valorResidualPct: 0.16,
  rentaInicial: 0,
  gpsInstalacion: 4200,
  gpsFinanciado: true,
  seguroAnual: 0,
  seguroFinanciado: true,
  generarOpciones: false,
  categoriaId: '',
  bienDescripcion: '',
  bienMarca: '',
  bienModelo: '',
  bienAnio: new Date().getFullYear(),
  bienNuevo: true,
  observaciones: '',
};

export default function Cotizador() {
  const navigate = useNavigate();
  const [form, setForm] = useState(defaultForm);
  const [result, setResult] = useState<SimulationResult | null>(null);
  const [categories, setCategories] = useState<AssetCategory[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [showAmortization, setShowAmortization] = useState(false);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    api.get('/catalogs/asset-categories')
      .then((res) => setCategories(res.data))
      .catch(() => {});
  }, []);

  const simulate = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const res = await api.post('/quotations/simulate', {
        ...form,
        generarOpciones: form.generarOpciones,
      });
      setResult(res.data);
    } catch (err: any) {
      setError(err.response?.data?.error?.[0]?.message || 'Error al simular');
    } finally {
      setLoading(false);
    }
  }, [form]);

  const saveQuotation = async () => {
    if (!form.nombreCliente.trim()) {
      setError('Ingresa el nombre del cliente');
      return;
    }
    setSaving(true);
    setError('');
    try {
      const res = await api.post('/quotations', form);
      navigate(`/cotizaciones/${res.data.id}`);
    } catch (err: any) {
      setError(err.response?.data?.error?.[0]?.message || 'Error al guardar');
    } finally {
      setSaving(false);
    }
  };

  const reset = () => {
    setForm(defaultForm);
    setResult(null);
    setError('');
  };

  const updateField = (field: string, value: any) => {
    setForm((prev) => ({ ...prev, [field]: value }));
  };

  const riskDefaults: Record<string, { enganchePct: number; depositoGarantiaPct: number; valorResidualPct: number }> = {
    A: { enganchePct: 0, depositoGarantiaPct: 0.16, valorResidualPct: 0.16 },
    B: { enganchePct: 0.05, depositoGarantiaPct: 0.21, valorResidualPct: 0.21 },
    C: { enganchePct: 0.10, depositoGarantiaPct: 0.26, valorResidualPct: 0.26 },
  };

  const handleRiskChange = (level: 'A' | 'B' | 'C') => {
    const defaults = riskDefaults[level];
    setForm((prev) => ({ ...prev, nivelRiesgo: level, ...defaults }));
  };

  return (
    <div className="max-w-7xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Cotizador</h1>
          <p className="text-gray-500 text-sm mt-1">Simula y guarda cotizaciones de arrendamiento</p>
        </div>
        <button onClick={reset} className="text-sm text-gray-500 hover:text-gray-700 flex items-center gap-1">
          <RotateCcw size={14} /> Limpiar
        </button>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg text-sm mb-4">
          {error}
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Form */}
        <div className="lg:col-span-2 space-y-4">
          {/* Client & Product */}
          <div className="bg-white rounded-xl border border-gray-200 p-6">
            <h3 className="font-semibold text-gray-900 mb-4">Datos Generales</h3>
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-600 mb-1">Nombre del Cliente</label>
                <input
                  type="text"
                  value={form.nombreCliente}
                  onChange={(e) => updateField('nombreCliente', e.target.value)}
                  placeholder="Nombre o razon social"
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-inyecta-500 focus:border-inyecta-500 outline-none"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-600 mb-1">Categoria del Bien</label>
                <select
                  value={form.categoriaId}
                  onChange={(e) => updateField('categoriaId', e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-inyecta-500 focus:border-inyecta-500 outline-none"
                >
                  <option value="">Seleccionar...</option>
                  {categories.map((cat) => (
                    <option key={cat.id} value={cat.id}>{cat.nombre}</option>
                  ))}
                </select>
              </div>
            </div>
          </div>

          {/* Financial parameters */}
          <div className="bg-white rounded-xl border border-gray-200 p-6">
            <h3 className="font-semibold text-gray-900 mb-4">Parametros Financieros</h3>
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-600 mb-1">Producto</label>
                <div className="flex gap-2">
                  {['PURO', 'FINANCIERO'].map((p) => (
                    <button
                      key={p}
                      onClick={() => updateField('producto', p)}
                      className={`flex-1 py-2 px-3 rounded-lg text-sm font-medium transition-colors ${
                        form.producto === p
                          ? 'bg-inyecta-700 text-white'
                          : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                      }`}
                    >
                      {p === 'PURO' ? 'Puro' : 'Financiero'}
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-600 mb-1">Nivel de Riesgo</label>
                <div className="flex gap-2">
                  {(['A', 'B', 'C'] as const).map((r) => (
                    <button
                      key={r}
                      onClick={() => handleRiskChange(r)}
                      className={`flex-1 py-2 px-3 rounded-lg text-sm font-medium transition-colors ${
                        form.nivelRiesgo === r
                          ? 'bg-inyecta-700 text-white'
                          : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                      }`}
                    >
                      {r}
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-600 mb-1">Valor del Bien (sin IVA)</label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm">$</span>
                  <input
                    type="number"
                    value={form.valorBien}
                    onChange={(e) => updateField('valorBien', Number(e.target.value))}
                    min={150000}
                    max={3000000}
                    className="w-full pl-7 pr-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-inyecta-500 focus:border-inyecta-500 outline-none"
                  />
                </div>
                <p className="text-xs text-gray-400 mt-1">Min: $150,000 - Max: $3,000,000</p>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-600 mb-1">Plazo (meses)</label>
                <select
                  value={form.plazo}
                  onChange={(e) => updateField('plazo', Number(e.target.value))}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-inyecta-500 focus:border-inyecta-500 outline-none"
                >
                  {[12, 18, 24, 30, 36, 42, 48].map((p) => (
                    <option key={p} value={p}>{p} meses</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-600 mb-1">
                  Tasa Anual: {(form.tasaAnual * 100).toFixed(0)}%
                </label>
                <input
                  type="range"
                  min={0.12}
                  max={0.60}
                  step={0.01}
                  value={form.tasaAnual}
                  onChange={(e) => updateField('tasaAnual', Number(e.target.value))}
                  className="w-full accent-inyecta-600"
                />
                <div className="flex justify-between text-xs text-gray-400">
                  <span>12%</span><span>60%</span>
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-600 mb-1">
                  Deposito de Garantia: {(form.depositoGarantiaPct * 100).toFixed(0)}%
                </label>
                <input
                  type="range"
                  min={0}
                  max={0.40}
                  step={0.01}
                  value={form.depositoGarantiaPct}
                  onChange={(e) => updateField('depositoGarantiaPct', Number(e.target.value))}
                  className="w-full accent-inyecta-600"
                />
              </div>
            </div>
          </div>

          {/* Advanced */}
          <div className="bg-white rounded-xl border border-gray-200">
            <button
              onClick={() => setShowAdvanced(!showAdvanced)}
              className="w-full flex items-center justify-between p-4 text-sm font-medium text-gray-700"
            >
              Parametros Avanzados
              {showAdvanced ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
            </button>
            {showAdvanced && (
              <div className="px-6 pb-6 grid grid-cols-1 lg:grid-cols-2 gap-4 border-t border-gray-100 pt-4">
                <div>
                  <label className="block text-sm font-medium text-gray-600 mb-1">
                    Enganche: {(form.enganchePct * 100).toFixed(0)}%
                  </label>
                  <input
                    type="range"
                    min={0}
                    max={0.30}
                    step={0.01}
                    value={form.enganchePct}
                    onChange={(e) => updateField('enganchePct', Number(e.target.value))}
                    className="w-full accent-inyecta-600"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-600 mb-1">
                    Comision Apertura: {(form.comisionAperturaPct * 100).toFixed(0)}%
                  </label>
                  <input
                    type="range"
                    min={0}
                    max={0.10}
                    step={0.005}
                    value={form.comisionAperturaPct}
                    onChange={(e) => updateField('comisionAperturaPct', Number(e.target.value))}
                    className="w-full accent-inyecta-600"
                  />
                </div>
                <div className="flex items-center gap-3">
                  <input
                    type="checkbox"
                    checked={form.comisionAperturaFinanciada}
                    onChange={(e) => updateField('comisionAperturaFinanciada', e.target.checked)}
                    className="rounded accent-inyecta-600"
                  />
                  <span className="text-sm text-gray-600">Comision apertura financiada</span>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-600 mb-1">
                    Valor Residual: {(form.valorResidualPct * 100).toFixed(0)}%
                  </label>
                  <input
                    type="range"
                    min={0}
                    max={0.40}
                    step={0.01}
                    value={form.valorResidualPct}
                    onChange={(e) => updateField('valorResidualPct', Number(e.target.value))}
                    className="w-full accent-inyecta-600"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-600 mb-1">Renta Inicial</label>
                  <input
                    type="number"
                    value={form.rentaInicial}
                    onChange={(e) => updateField('rentaInicial', Number(e.target.value))}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-inyecta-500 focus:border-inyecta-500 outline-none"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-600 mb-1">GPS Instalacion</label>
                  <input
                    type="number"
                    value={form.gpsInstalacion}
                    onChange={(e) => updateField('gpsInstalacion', Number(e.target.value))}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-inyecta-500 focus:border-inyecta-500 outline-none"
                  />
                </div>
                <div className="flex items-center gap-3">
                  <input
                    type="checkbox"
                    checked={form.gpsFinanciado}
                    onChange={(e) => updateField('gpsFinanciado', e.target.checked)}
                    className="rounded accent-inyecta-600"
                  />
                  <span className="text-sm text-gray-600">GPS financiado</span>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-600 mb-1">Seguro Anual</label>
                  <input
                    type="number"
                    value={form.seguroAnual}
                    onChange={(e) => updateField('seguroAnual', Number(e.target.value))}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-inyecta-500 focus:border-inyecta-500 outline-none"
                  />
                </div>
                <div className="flex items-center gap-3">
                  <input
                    type="checkbox"
                    checked={form.seguroFinanciado}
                    onChange={(e) => updateField('seguroFinanciado', e.target.checked)}
                    className="rounded accent-inyecta-600"
                  />
                  <span className="text-sm text-gray-600">Seguro financiado</span>
                </div>
                <div className="flex items-center gap-3">
                  <input
                    type="checkbox"
                    checked={form.generarOpciones}
                    onChange={(e) => updateField('generarOpciones', e.target.checked)}
                    className="rounded accent-inyecta-600"
                  />
                  <span className="text-sm text-gray-600">Generar 6 opciones de riesgo</span>
                </div>
                <div className="md:col-span-2">
                  <label className="block text-sm font-medium text-gray-600 mb-1">Observaciones</label>
                  <textarea
                    value={form.observaciones}
                    onChange={(e) => updateField('observaciones', e.target.value)}
                    rows={2}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-inyecta-500 focus:border-inyecta-500 outline-none resize-none"
                  />
                </div>
              </div>
            )}
          </div>

          {/* Actions */}
          <div className="flex gap-3">
            <button
              onClick={simulate}
              disabled={loading}
              className="flex-1 bg-inyecta-700 hover:bg-inyecta-800 disabled:bg-inyecta-400 text-white py-3 rounded-xl text-sm font-medium flex items-center justify-center gap-2 transition-colors"
            >
              {loading ? (
                <div className="animate-spin rounded-full h-4 w-4 border-2 border-white border-t-transparent" />
              ) : (
                <>
                  <Calculator size={16} /> Simular
                </>
              )}
            </button>
            <button
              onClick={saveQuotation}
              disabled={saving || !result}
              className="flex-1 bg-accent hover:bg-accent-dark disabled:bg-gray-300 text-white py-3 rounded-xl text-sm font-medium flex items-center justify-center gap-2 transition-colors"
            >
              {saving ? (
                <div className="animate-spin rounded-full h-4 w-4 border-2 border-white border-t-transparent" />
              ) : (
                <>
                  <Save size={16} /> Guardar Cotizacion
                </>
              )}
            </button>
          </div>
        </div>

        {/* Results sidebar */}
        <div className="space-y-4">
          <div className="bg-white rounded-xl border border-gray-200 p-6">
            <h3 className="font-semibold text-gray-900 mb-4">Resumen</h3>
            {result ? (
              <div className="space-y-3">
                <ResultRow label="Valor del Bien + IVA" value={formatCurrency(result.resultado.valorBienIVA)} />
                <ResultRow label="Enganche" value={formatCurrency(result.resultado.enganche)} />
                <ResultRow label="Deposito Garantia" value={formatCurrency(result.resultado.depositoGarantia)} />
                <ResultRow label="Comision Apertura" value={formatCurrency(result.resultado.comisionApertura)} />
                <ResultRow label="Monto a Financiar" value={formatCurrency(result.resultado.montoFinanciar)} highlight />
                <div className="border-t border-gray-100 pt-3">
                  <ResultRow label="Renta Mensual" value={formatCurrency(result.resultado.rentaMensual)} />
                  <ResultRow label="Renta + IVA" value={formatCurrency(result.resultado.rentaMensualIVA)} highlight accent />
                  <ResultRow label="Valor Residual" value={formatCurrency(result.resultado.valorResidual)} />
                </div>
                <div className="border-t border-gray-100 pt-3">
                  <ResultRow label="Total Rentas" value={formatCurrency(result.resultado.totalRentas)} />
                  <ResultRow label="Total a Pagar" value={formatCurrency(result.resultado.totalPagar)} />
                  <ResultRow label="Ganancia" value={formatCurrency(result.resultado.ganancia)} accent />
                </div>
              </div>
            ) : (
              <p className="text-sm text-gray-400 text-center py-8">
                Ajusta los parametros y presiona Simular
              </p>
            )}
          </div>

          {/* Amortization toggle */}
          {result && (
            <div className="bg-white rounded-xl border border-gray-200">
              <button
                onClick={() => setShowAmortization(!showAmortization)}
                className="w-full flex items-center justify-between p-4 text-sm font-medium text-gray-700"
              >
                Tabla de Amortizacion ({form.plazo} meses)
                {showAmortization ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
              </button>
              {showAmortization && (
                <div className="px-4 pb-4 overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="border-b border-gray-200">
                        <th className="py-2 text-left font-medium text-gray-500">#</th>
                        <th className="py-2 text-right font-medium text-gray-500">Capital</th>
                        <th className="py-2 text-right font-medium text-gray-500">Interes</th>
                        <th className="py-2 text-right font-medium text-gray-500">Renta+IVA</th>
                        <th className="py-2 text-right font-medium text-gray-500">Saldo</th>
                      </tr>
                    </thead>
                    <tbody>
                      {result.resultado.amortizacion.map((row) => (
                        <tr key={row.periodo} className="border-b border-gray-50">
                          <td className="py-1.5 text-gray-600">{row.periodo}</td>
                          <td className="py-1.5 text-right text-gray-700">{formatCurrency(row.capital)}</td>
                          <td className="py-1.5 text-right text-gray-700">{formatCurrency(row.interes)}</td>
                          <td className="py-1.5 text-right font-medium text-gray-900">{formatCurrency(row.rentaConIVA)}</td>
                          <td className="py-1.5 text-right text-gray-500">{formatCurrency(row.saldoFinal)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}

          {/* Options */}
          {result?.opciones && result.opciones.length > 0 && (
            <div className="bg-white rounded-xl border border-gray-200 p-6">
              <h3 className="font-semibold text-gray-900 mb-4">Opciones de Riesgo</h3>
              <div className="space-y-3">
                {result.opciones.map((op, i) => (
                  <div key={i} className="p-3 bg-gray-50 rounded-lg">
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-xs font-medium text-inyecta-700">{op.nombre}</span>
                      <span className="text-xs bg-inyecta-100 text-inyecta-700 px-2 py-0.5 rounded">
                        {op.nivelRiesgo} - {op.producto}
                      </span>
                    </div>
                    <div className="text-sm font-semibold text-gray-900">
                      Renta: {formatCurrency(op.rentaMensualIVA)}
                    </div>
                    <div className="text-xs text-gray-500 mt-1">
                      Enganche: {formatCurrency(op.enganche)} | Deposito: {formatCurrency(op.depositoGarantia)}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function ResultRow({ label, value, highlight, accent }: { label: string; value: string; highlight?: boolean; accent?: boolean }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-sm text-gray-500">{label}</span>
      <span className={`text-sm font-medium ${accent ? 'text-accent' : highlight ? 'text-inyecta-700' : 'text-gray-900'}`}>
        {value}
      </span>
    </div>
  );
}
