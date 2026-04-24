import { useState, useEffect, useCallback, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { PDFDownloadLink } from '@react-pdf/renderer';
import api from '@/lib/api';
import { formatCurrency } from '@/lib/utils';
import { Calculator, Save, RotateCcw, ChevronDown, ChevronUp, FileText, Table, Plus, X, Sparkles } from 'lucide-react';
import { calcularCotizacion } from '@/lib/cotizacion/calculos';
import {
  calcAmortPuro,
  calcAmortFinanciero,
  aplicarPagoAdicionalPuro,
  aplicarPagoAdicionalFinanciero,
  type FilaAmortPuro,
  type FilaAmortFinanciero,
} from '@/lib/cotizacion/amortizacion';
import { CotizacionPDF } from '@/lib/pdf/CotizacionPDF';
import { AmortizacionPDF } from '@/lib/pdf/AmortizacionPDF';

/** Forma del payload de error del backend cuando la validación Zod
 *  falla: `{error: [{message: string, ...}, ...]}`. Cuando NO hay
 *  detalles de Zod, usa el campo `error` plano o `message` del axios. */
type ZodApiErr = {
  response?: { data?: { error?: Array<{ message?: string }> | string } };
  message?: string;
};
function zodOrApiErrorMessage(err: unknown, fallback: string): string {
  const e = err as ZodApiErr;
  const errArr = e?.response?.data?.error;
  if (Array.isArray(errArr) && errArr[0]?.message) return errArr[0].message;
  if (typeof errArr === 'string') return errArr;
  return e?.message ?? fallback;
}

interface PagoExtra {
  id: string;
  periodo: number;
  monto: number;
}

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

/** Fecha de hoy en formato YYYY-MM-DD para el input date */
function todayISO(): string {
  const d = new Date();
  return (
    d.getFullYear() +
    '-' +
    String(d.getMonth() + 1).padStart(2, '0') +
    '-' +
    String(d.getDate()).padStart(2, '0')
  );
}

const defaultForm = {
  nombreCliente: '',
  producto: 'PURO' as 'PURO' | 'FINANCIERO',
  valorBien: 500000,
  plazo: 36,
  tasaAnual: 0.36,
  nivelRiesgo: 'A' as 'A' | 'B' | 'C',
  enganchePct: 0,
  engancheEsContado: true,           // true = pago inicial / false = reduce monto a financiar
  depositoGarantiaPct: 0.16,
  comisionAperturaPct: 0.05,
  comisionAperturaFinanciada: true,
  valorResidualPct: 0.16,
  /** §4.13: PURO — si true, el residual se iguala a la comisión apertura */
  valorResidualEsComision: false,
  rentaInicial: 0,
  gpsInstalacion: 4200,
  gpsFinanciado: true,
  seguroAnual: 0,
  /** §4.14: si true, el seguro NO entra en B17 ni en la renta hasta
   *  que se especifique un monto (PDF muestra "Pendiente de cotizar"). */
  seguroPendiente: true,
  seguroFinanciado: true,
  seguroEstado: 'Pendiente',         // "Pendiente" | "Contratado"
  fechaPrimerPago: todayISO(),       // YYYY-MM-DD
  generarOpciones: false,
  categoriaId: '',
  bienDescripcion: '',
  bienMarca: '',
  bienModelo: '',
  bienAnio: new Date().getFullYear(),
  bienNuevo: true,
  observaciones: '',
};

interface CotizadorProps {
  /** Producto pre-seleccionado cuando se entra desde /cotizador/puro o /cotizador/financiero */
  productoInicial?: 'PURO' | 'FINANCIERO';
}

export default function Cotizador({ productoInicial }: CotizadorProps = {}) {
  const navigate = useNavigate();
  const [form, setForm] = useState({
    ...defaultForm,
    producto: productoInicial ?? defaultForm.producto,
    // Defaults por producto: PURO → residual 16%, FIN → residual 2% (opción de compra)
    valorResidualPct: productoInicial === 'FINANCIERO' ? 0.02 : 0.16,
    depositoGarantiaPct: productoInicial === 'FINANCIERO' ? 0.16 : 0.16,
  });
  const [result, setResult] = useState<SimulationResult | null>(null);
  const [categories, setCategories] = useState<AssetCategory[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [showAmortization, setShowAmortization] = useState(false);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [error, setError] = useState('');

  // T8 — Simulación de pagos adicionales
  const [pagosExtra, setPagosExtra] = useState<PagoExtra[]>([]);
  const [nuevoPagoPeriodo, setNuevoPagoPeriodo] = useState<number>(12);
  const [nuevoPagoMonto, setNuevoPagoMonto]   = useState<number>(0);
  const [pagoError, setPagoError]             = useState('');

  useEffect(() => {
    api.get('/catalogs/asset-categories')
      .then((res) => setCategories(res.data))
      .catch((err) => {
        // El cotizador funciona sin el catálogo (campos manuales);
        // si falla, simplemente no hay autocomplete de categorías.
        console.warn('[Cotizador] No se pudo cargar el catálogo de categorías', err);
      });
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
    } catch (err) {
      setError(zodOrApiErrorMessage(err, 'Error al simular'));
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
    } catch (err) {
      setError(zodOrApiErrorMessage(err, 'Error al guardar'));
    } finally {
      setSaving(false);
    }
  };

  const reset = () => {
    setForm(defaultForm);
    setResult(null);
    setError('');
  };

  // El form mezcla strings, numbers y booleans; tipamos como K/Value pares
  // para que TS deje pasar updateField('plazo', 48) y updateField(
  // 'nombreCliente', 'Juan') sin requerir overloads explícitos.
  type FormState = typeof form;
  const updateField = <K extends keyof FormState>(field: K, value: FormState[K]) => {
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

  // ── Datos para los PDFs (cliente, sin pasar por servidor) ─────────
  // Usamos el motor de cálculo verificado al centavo y derivamos los
  // campos descriptivos del formulario actual.
  const pdfData = useMemo(() => {
    if (!result) return null;

    const fechaPrimerPagoDate = (() => {
      const [y, m, d] = form.fechaPrimerPago.split('-').map(Number);
      return new Date(y, (m || 1) - 1, d || 1, 12, 0, 0);
    })();

    const valorBienConIVA = form.valorBien * 1.16;
    const nombreBien =
      form.bienDescripcion ||
      [form.bienMarca, form.bienModelo, form.bienAnio].filter(Boolean).join(' ') ||
      'Bien arrendado';

    const cotData = calcularCotizacion({
      valorBienConIVA,
      tasaIVA: 0.16,
      producto: form.producto,
      plazo: form.plazo,
      tasaAnual: form.tasaAnual,
      tasaComisionApertura: form.comisionAperturaPct,
      comisionAperturaEsContado: !form.comisionAperturaFinanciada,
      // §4.12: depósito y residual separados (antes fusionados)
      porcentajeDeposito: form.depositoGarantiaPct,
      valorResidual: form.valorResidualPct,
      valorResidualEsComision: form.valorResidualEsComision,
      gpsMonto: form.gpsInstalacion,
      gpsEsContado: !form.gpsFinanciado,
      seguroAnual: form.seguroAnual,
      seguroPendiente: form.seguroPendiente,
      seguroEsContado: !form.seguroFinanciado,
      // §4.2: enganche se resta de B17 sobre valorSinIVA (no conIVA)
      engancheMonto: form.valorBien * form.enganchePct,
      engancheEsContado: form.engancheEsContado,
      nombreBien,
      estadoBien: form.bienNuevo ? 'Nuevo' : 'Seminuevo',
      seguroEstado: form.seguroEstado,
      nombreCliente: form.nombreCliente || 'Sin nombre',
      fecha: new Date(),
    });

    const filasPuro =
      form.producto === 'PURO'
        ? calcAmortPuro(cotData.rentaMensual.montoNeto, form.plazo, fechaPrimerPagoDate)
        : undefined;

    const filasFinanciero =
      form.producto === 'FINANCIERO'
        ? calcAmortFinanciero(
            cotData.montoFinanciadoReal,
            form.tasaAnual,
            form.plazo,
            cotData.fvAmortizacion,
            fechaPrimerPagoDate,
          )
        : undefined;

    return { cotData, filasPuro, filasFinanciero };
  }, [
    result,
    form.valorBien,
    form.producto,
    form.plazo,
    form.tasaAnual,
    form.comisionAperturaPct,
    form.comisionAperturaFinanciada,
    form.depositoGarantiaPct,
    form.valorResidualPct,
    form.valorResidualEsComision,
    form.gpsInstalacion,
    form.gpsFinanciado,
    form.seguroAnual,
    form.seguroPendiente,
    form.seguroFinanciado,
    form.enganchePct,
    form.engancheEsContado,
    form.bienDescripcion,
    form.bienMarca,
    form.bienModelo,
    form.bienAnio,
    form.bienNuevo,
    form.seguroEstado,
    form.fechaPrimerPago,
    form.nombreCliente,
  ]);

  // ── Simulación de pagos adicionales (CLAUDE.md §4.10) ────────────
  // Aplica los pagos en orden ascendente de período sobre la tabla
  // base ya calculada. Si algún pago es inválido (fuera de rango,
  // excede el saldo), se reporta el error y se descarta ese pago de
  // la simulación (los previos válidos se conservan).
  const pagosSimulacion = useMemo(() => {
    if (!pdfData || pagosExtra.length === 0) return null;
    const ordenados = [...pagosExtra].sort((a, b) => a.periodo - b.periodo);

    if (form.producto === 'PURO' && pdfData.filasPuro) {
      let tabla: FilaAmortPuro[] = pdfData.filasPuro;
      const errores: string[] = [];
      for (const p of ordenados) {
        try {
          tabla = aplicarPagoAdicionalPuro(tabla, p.periodo, p.monto);
        } catch (e) {
          errores.push(`Período ${p.periodo}: ${(e as Error).message}`);
        }
      }
      const original = pdfData.filasPuro;
      const totalOriginal = original.reduce((s, f) => s + f.total, 0);
      const totalNuevo    = tabla.reduce((s, f) => s + f.total, 0);
      const ahorro        = totalOriginal - totalNuevo;
      // Renta neta del último período (la "nueva renta" tras los abonos)
      const rentaFinal = tabla[tabla.length - 1].renta;
      const rentaOriginal = original[0].renta;
      return {
        tipo: 'PURO' as const,
        tablaPuro: tabla,
        rentaOriginal,
        rentaFinal,
        ahorro,
        totalOriginal,
        totalNuevo,
        errores,
      };
    }

    if (form.producto === 'FINANCIERO' && pdfData.filasFinanciero) {
      let tabla: FilaAmortFinanciero[] = pdfData.filasFinanciero;
      const errores: string[] = [];
      for (const p of ordenados) {
        try {
          tabla = aplicarPagoAdicionalFinanciero(
            tabla,
            p.periodo,
            p.monto,
            form.tasaAnual,
            pdfData.cotData.fvAmortizacion,
          );
        } catch (e) {
          errores.push(`Período ${p.periodo}: ${(e as Error).message}`);
        }
      }
      const original = pdfData.filasFinanciero;
      const totalOriginal = original.reduce((s, f) => s + f.total, 0);
      const totalNuevo    = tabla.reduce((s, f) => s + f.total, 0);
      const ahorro        = totalOriginal - totalNuevo;
      const rentaFinal    = tabla[tabla.length - 1].total;
      const rentaOriginal = original[0].total;
      return {
        tipo: 'FINANCIERO' as const,
        tablaFinanciero: tabla,
        rentaOriginal,
        rentaFinal,
        ahorro,
        totalOriginal,
        totalNuevo,
        errores,
      };
    }
    return null;
  }, [pdfData, pagosExtra, form.producto, form.tasaAnual]);

  const periodosConPago = useMemo(
    () => new Set(pagosExtra.map(p => p.periodo)),
    [pagosExtra],
  );

  const agregarPagoExtra = () => {
    setPagoError('');
    if (!pdfData) {
      setPagoError('Primero simula la cotización');
      return;
    }
    const periodo = Math.floor(nuevoPagoPeriodo);
    const monto   = Number(nuevoPagoMonto);
    if (!Number.isFinite(periodo) || periodo < 1 || periodo >= form.plazo) {
      setPagoError(`El período debe estar entre 1 y ${form.plazo - 1}`);
      return;
    }
    if (!Number.isFinite(monto) || monto <= 0) {
      setPagoError('El monto debe ser mayor a cero');
      return;
    }
    if (periodosConPago.has(periodo)) {
      setPagoError(`Ya hay un pago adicional registrado en el período ${periodo}`);
      return;
    }
    setPagosExtra(prev => [
      ...prev,
      { id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`, periodo, monto },
    ]);
    setNuevoPagoMonto(0);
  };

  const eliminarPagoExtra = (id: string) => {
    setPagosExtra(prev => prev.filter(p => p.id !== id));
    setPagoError('');
  };

  const limpiarPagosExtra = () => {
    setPagosExtra([]);
    setPagoError('');
  };

  /** Slug seguro para los nombres de archivo */
  const fileSlug = (form.nombreCliente || 'cotizacion')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 40) || 'cotizacion';

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
              <div className="lg:col-span-2">
                <label className="block text-sm font-medium text-gray-600 mb-1">Descripción del Bien</label>
                <input
                  type="text"
                  value={form.bienDescripcion}
                  onChange={(e) => updateField('bienDescripcion', e.target.value)}
                  placeholder="Ej: Camioneta Toyota Hilux 4x4 2025"
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-inyecta-500 focus:border-inyecta-500 outline-none"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-600 mb-1">Estado del Bien</label>
                <div className="flex gap-2">
                  {[
                    { v: true,  label: 'Nuevo' },
                    { v: false, label: 'Seminuevo' },
                  ].map((opt) => (
                    <button
                      key={opt.label}
                      onClick={() => updateField('bienNuevo', opt.v)}
                      className={`flex-1 py-2 px-3 rounded-lg text-sm font-medium transition-colors ${
                        form.bienNuevo === opt.v
                          ? 'bg-inyecta-700 text-white'
                          : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                      }`}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-600 mb-1">Estado del Seguro</label>
                <select
                  value={form.seguroEstado}
                  onChange={(e) => updateField('seguroEstado', e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-inyecta-500 focus:border-inyecta-500 outline-none"
                >
                  <option value="Pendiente">Pendiente</option>
                  <option value="Contratado">Contratado</option>
                  <option value="Cliente">Por cuenta del cliente</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-600 mb-1">Fecha Primer Pago</label>
                <input
                  type="date"
                  value={form.fechaPrimerPago}
                  onChange={(e) => updateField('fechaPrimerPago', e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-inyecta-500 focus:border-inyecta-500 outline-none"
                />
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
                  {(['PURO', 'FINANCIERO'] as const).map((p) => (
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
                <div className="flex items-center gap-3">
                  <input
                    type="checkbox"
                    checked={form.engancheEsContado}
                    onChange={(e) => updateField('engancheEsContado', e.target.checked)}
                    className="rounded accent-inyecta-600"
                  />
                  <span className="text-sm text-gray-600">Enganche de contado (si no, descuenta del monto a financiar)</span>
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
                    {form.producto === 'PURO' && form.valorResidualEsComision && (
                      <span className="ml-2 text-xs text-inyecta-700 font-normal">
                        (igualado a la comisión)
                      </span>
                    )}
                  </label>
                  <input
                    type="range"
                    min={0}
                    max={0.40}
                    step={0.01}
                    value={form.valorResidualPct}
                    onChange={(e) => updateField('valorResidualPct', Number(e.target.value))}
                    disabled={form.producto === 'PURO' && form.valorResidualEsComision}
                    className="w-full accent-inyecta-600 disabled:opacity-40"
                  />
                </div>
                {form.producto === 'PURO' && (
                  <div className="flex items-center gap-3">
                    <input
                      id="cot-residual-es-comision"
                      type="checkbox"
                      checked={form.valorResidualEsComision}
                      onChange={(e) => updateField('valorResidualEsComision', e.target.checked)}
                      className="rounded accent-inyecta-600"
                    />
                    <label htmlFor="cot-residual-es-comision" className="text-sm text-gray-600 cursor-pointer">
                      Valor residual = comisión de apertura (§4.13)
                    </label>
                  </div>
                )}
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
                  <label className="block text-sm font-medium text-gray-600 mb-1">
                    Seguro Anual
                    {form.seguroPendiente && (
                      <span className="ml-2 text-xs text-amber-700 font-normal">
                        (pendiente de cotizar)
                      </span>
                    )}
                  </label>
                  <input
                    type="number"
                    value={form.seguroAnual}
                    onChange={(e) => updateField('seguroAnual', Number(e.target.value))}
                    disabled={form.seguroPendiente}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-inyecta-500 focus:border-inyecta-500 outline-none disabled:bg-gray-50 disabled:text-gray-400"
                  />
                </div>
                <div className="flex items-center gap-3">
                  <input
                    id="cot-seguro-pendiente"
                    type="checkbox"
                    checked={form.seguroPendiente}
                    onChange={(e) => updateField('seguroPendiente', e.target.checked)}
                    className="rounded accent-inyecta-600"
                  />
                  <label htmlFor="cot-seguro-pendiente" className="text-sm text-gray-600 cursor-pointer">
                    Seguro pendiente de cotizar (§4.14)
                  </label>
                </div>
                <div className="flex items-center gap-3">
                  <input
                    type="checkbox"
                    checked={form.seguroFinanciado}
                    onChange={(e) => updateField('seguroFinanciado', e.target.checked)}
                    disabled={form.seguroPendiente}
                    className="rounded accent-inyecta-600 disabled:opacity-40"
                  />
                  <span className={`text-sm ${form.seguroPendiente ? 'text-gray-400' : 'text-gray-600'}`}>
                    Seguro financiado
                  </span>
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

          {/* PDFs (cotización + amortización) */}
          {pdfData && (
            <div className="bg-white rounded-xl border border-gray-200 p-6 space-y-3">
              <h3 className="font-semibold text-gray-900">Documentos PDF</h3>
              <p className="text-xs text-gray-500 -mt-1">
                Generados con los parámetros actuales (cliente, sin enviar al servidor).
              </p>

              <PDFDownloadLink
                document={
                  <CotizacionPDF
                    data={pdfData.cotData}
                    tasaAnual={form.tasaAnual}
                  />
                }
                fileName={`cotizacion-${fileSlug}.pdf`}
                className="w-full bg-inyecta-700 hover:bg-inyecta-800 text-white py-2.5 rounded-lg text-sm font-medium flex items-center justify-center gap-2 transition-colors"
              >
                {({ loading: pdfLoading }) => (
                  <>
                    <FileText size={15} />
                    {pdfLoading ? 'Generando...' : 'Descargar Cotización'}
                  </>
                )}
              </PDFDownloadLink>

              <PDFDownloadLink
                document={
                  <AmortizacionPDF
                    data={pdfData.cotData}
                    tasaAnual={form.tasaAnual}
                    filasPuro={pdfData.filasPuro}
                    filasFinanciero={pdfData.filasFinanciero}
                  />
                }
                fileName={`amortizacion-${fileSlug}.pdf`}
                className="w-full bg-accent hover:bg-accent-dark text-white py-2.5 rounded-lg text-sm font-medium flex items-center justify-center gap-2 transition-colors"
              >
                {({ loading: pdfLoading }) => (
                  <>
                    <Table size={15} />
                    {pdfLoading ? 'Generando...' : 'Descargar Tabla de Amortización'}
                  </>
                )}
              </PDFDownloadLink>

              <p className="text-[10px] text-gray-400 leading-relaxed">
                Tip: usa "Guardar Cotización" si quieres persistirla en el sistema y volver
                a generarla más adelante con su folio asignado.
              </p>
            </div>
          )}

          {/* T8 — Pagos adicionales (simulación) */}
          {pdfData && (
            <div className="bg-white rounded-xl border border-gray-200 p-6 space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Sparkles size={15} className="text-inyecta-600" />
                  <h3 className="font-semibold text-gray-900">Pagos Adicionales</h3>
                </div>
                {pagosExtra.length > 0 && (
                  <button
                    onClick={limpiarPagosExtra}
                    className="text-xs text-gray-400 hover:text-red-600 flex items-center gap-1"
                    title="Quitar todos los pagos adicionales"
                  >
                    <RotateCcw size={11} /> Limpiar
                  </button>
                )}
              </div>
              <p className="text-xs text-gray-500 -mt-1">
                {form.producto === 'PURO'
                  ? 'PURO: el pago adicional se prorratea entre las rentas restantes (Rentas Prorrateadas).'
                  : 'FINANCIERO: el pago adicional abona a capital y se recalcula la renta (Rentas Anticipadas).'}
              </p>

              {/* Form para agregar pago */}
              <div className="grid grid-cols-[1fr_1fr_auto] gap-2 items-end">
                <div>
                  <label className="block text-xs font-medium text-gray-500 mb-1">Período</label>
                  <input
                    type="number"
                    min={1}
                    max={form.plazo - 1}
                    value={nuevoPagoPeriodo}
                    onChange={e => setNuevoPagoPeriodo(Number(e.target.value))}
                    className="w-full px-2 py-1.5 border border-gray-300 rounded text-sm focus:ring-2 focus:ring-inyecta-500 focus:border-inyecta-500 outline-none"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-500 mb-1">
                    Monto {form.producto === 'PURO' ? '(neto)' : ''}
                  </label>
                  <div className="relative">
                    <span className="absolute left-2 top-1/2 -translate-y-1/2 text-gray-400 text-xs">$</span>
                    <input
                      type="number"
                      min={0}
                      step={1000}
                      value={nuevoPagoMonto || ''}
                      onChange={e => setNuevoPagoMonto(Number(e.target.value))}
                      placeholder="0"
                      className="w-full pl-5 pr-2 py-1.5 border border-gray-300 rounded text-sm focus:ring-2 focus:ring-inyecta-500 focus:border-inyecta-500 outline-none"
                    />
                  </div>
                </div>
                <button
                  onClick={agregarPagoExtra}
                  className="bg-inyecta-700 hover:bg-inyecta-800 text-white px-3 py-1.5 rounded text-xs font-medium flex items-center gap-1 transition-colors"
                >
                  <Plus size={12} /> Agregar
                </button>
              </div>

              {pagoError && (
                <div className="text-xs text-red-600 bg-red-50 border border-red-200 px-2 py-1.5 rounded">
                  {pagoError}
                </div>
              )}

              {/* Lista de pagos */}
              {pagosExtra.length > 0 && (
                <div className="space-y-1.5 pt-1">
                  {[...pagosExtra]
                    .sort((a, b) => a.periodo - b.periodo)
                    .map(p => (
                      <div
                        key={p.id}
                        className="flex items-center justify-between bg-amber-50 border border-amber-200 rounded px-2.5 py-1.5"
                      >
                        <div className="text-xs text-amber-900">
                          <span className="font-semibold">Período {p.periodo}</span>
                          <span className="text-amber-700"> · {formatCurrency(p.monto)}</span>
                        </div>
                        <button
                          onClick={() => eliminarPagoExtra(p.id)}
                          className="text-amber-400 hover:text-red-600"
                          title="Quitar"
                        >
                          <X size={12} />
                        </button>
                      </div>
                    ))}
                </div>
              )}

              {/* Resumen del impacto */}
              {pagosSimulacion && (
                <div className="border-t border-gray-100 pt-3 space-y-2">
                  {pagosSimulacion.errores.length > 0 && (
                    <div className="text-[11px] text-red-600 bg-red-50 border border-red-200 px-2 py-1.5 rounded">
                      {pagosSimulacion.errores.map((e, i) => (
                        <div key={i}>⚠ {e}</div>
                      ))}
                    </div>
                  )}
                  <div className="grid grid-cols-2 gap-2 text-xs">
                    <div className="bg-gray-50 rounded p-2">
                      <div className="text-gray-500">
                        {pagosSimulacion.tipo === 'PURO' ? 'Renta neta original' : 'Renta+IVA original'}
                      </div>
                      <div className="font-semibold text-gray-900">
                        {formatCurrency(pagosSimulacion.rentaOriginal)}
                      </div>
                    </div>
                    <div className="bg-emerald-50 rounded p-2">
                      <div className="text-emerald-700">
                        {pagosSimulacion.tipo === 'PURO' ? 'Nueva renta neta' : 'Nueva renta+IVA'}
                      </div>
                      <div className="font-semibold text-emerald-900">
                        {formatCurrency(pagosSimulacion.rentaFinal)}
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center justify-between bg-accent/10 border border-accent/20 rounded px-3 py-2">
                    <span className="text-xs text-accent font-medium">Ahorro proyectado</span>
                    <span className="text-sm font-bold text-accent">
                      {formatCurrency(Math.max(0, pagosSimulacion.ahorro))}
                    </span>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Amortization toggle */}
          {result && (
            <div className="bg-white rounded-xl border border-gray-200">
              <button
                onClick={() => setShowAmortization(!showAmortization)}
                className="w-full flex items-center justify-between p-4 text-sm font-medium text-gray-700"
              >
                Tabla de Amortizacion ({form.plazo} meses)
                {pagosSimulacion && (
                  <span className="ml-2 text-[10px] bg-amber-100 text-amber-800 px-2 py-0.5 rounded font-semibold">
                    SIMULACIÓN
                  </span>
                )}
                {showAmortization ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
              </button>
              {showAmortization && (
                <div className="px-4 pb-4 overflow-x-auto">
                  {/* Si hay simulación de pagos, mostramos la tabla recalculada */}
                  {pagosSimulacion?.tipo === 'PURO' && (
                    <table className="w-full text-xs">
                      <thead>
                        <tr className="border-b border-gray-200">
                          <th className="py-2 text-left font-medium text-gray-500">#</th>
                          <th className="py-2 text-left font-medium text-gray-500">Fecha</th>
                          <th className="py-2 text-right font-medium text-gray-500">Renta</th>
                          <th className="py-2 text-right font-medium text-gray-500">IVA</th>
                          <th className="py-2 text-right font-medium text-gray-500">Total</th>
                        </tr>
                      </thead>
                      <tbody>
                        {pagosSimulacion.tablaPuro.map(row => {
                          const conPago = periodosConPago.has(row.periodo);
                          return (
                            <tr
                              key={row.periodo}
                              className={`border-b border-gray-50 ${conPago ? 'bg-amber-50' : ''}`}
                            >
                              <td className="py-1.5 text-gray-600">
                                {row.periodo}
                                {conPago && <span className="text-amber-600 ml-1">★</span>}
                              </td>
                              <td className="py-1.5 text-gray-500">{row.fecha}</td>
                              <td className="py-1.5 text-right text-gray-700">{formatCurrency(row.renta)}</td>
                              <td className="py-1.5 text-right text-gray-700">{formatCurrency(row.iva)}</td>
                              <td className="py-1.5 text-right font-medium text-gray-900">
                                {formatCurrency(row.total)}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  )}

                  {pagosSimulacion?.tipo === 'FINANCIERO' && (
                    <table className="w-full text-xs">
                      <thead>
                        <tr className="border-b border-gray-200">
                          <th className="py-2 text-left font-medium text-gray-500">#</th>
                          <th className="py-2 text-right font-medium text-gray-500">Capital</th>
                          <th className="py-2 text-right font-medium text-gray-500">Interés</th>
                          <th className="py-2 text-right font-medium text-gray-500">Renta+IVA</th>
                          <th className="py-2 text-right font-medium text-gray-500">Saldo</th>
                        </tr>
                      </thead>
                      <tbody>
                        {pagosSimulacion.tablaFinanciero.map(row => {
                          const conPago = periodosConPago.has(row.periodo);
                          return (
                            <tr
                              key={row.periodo}
                              className={`border-b border-gray-50 ${conPago ? 'bg-amber-50' : ''}`}
                            >
                              <td className="py-1.5 text-gray-600">
                                {row.periodo}
                                {conPago && <span className="text-amber-600 ml-1">★</span>}
                              </td>
                              <td className="py-1.5 text-right text-gray-700">{formatCurrency(row.capital)}</td>
                              <td className="py-1.5 text-right text-gray-700">{formatCurrency(row.interes)}</td>
                              <td className="py-1.5 text-right font-medium text-gray-900">
                                {formatCurrency(row.total)}
                              </td>
                              <td className="py-1.5 text-right text-gray-500">{formatCurrency(row.saldo)}</td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  )}

                  {/* Tabla server-side original (cuando no hay simulación) */}
                  {!pagosSimulacion && (
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
                  )}
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
