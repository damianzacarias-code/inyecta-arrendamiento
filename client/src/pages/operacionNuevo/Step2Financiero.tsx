// Paso 2 — Parámetros financieros + datos de la solicitud CNBV.
//
// Re-implementación de la lógica de cálculo live de la página legacy
// (ContratoNuevo.tsx) pero usando useFormContext. Cada cambio en
// valorBien/plazo/tasa/comisión/GPS/residual actualiza los derivados
// calculados (enganche, depósito, comisión, monto a financiar, renta,
// renta+IVA) y los sincroniza al form para que el POST los lleve.
//
// Para la fidelidad contra el Excel de referencia y los tests del
// cotizador seguimos usando la misma fórmula PMT que antes.
//
// La parte "Datos de la solicitud" (lugar, fecha, promotor, monto
// solicitado, destino) vive abajo como un bloque separado.

import { useEffect, useMemo } from 'react';
import { useFormContext } from 'react-hook-form';
import { Calculator } from 'lucide-react';
import { FormSection, SelectField, TextAreaField, TextField } from '@/components/wizard/fields';
import { formatCurrency } from '@/lib/utils';
import { plazoOptions, RISK_PRESETS } from './constants';

/** PMT simple (no Decimal.js; replica la lógica de la página legacy). */
function pmt(rateMonthly: number, n: number, pv: number): number {
  if (pv <= 0 || n <= 0) return 0;
  if (rateMonthly === 0) return pv / n;
  const v =
    (pv * rateMonthly * Math.pow(1 + rateMonthly, n)) /
    (Math.pow(1 + rateMonthly, n) - 1);
  return Math.round(v * 100) / 100;
}

export function Step2Financiero() {
  const { watch, setValue, register } = useFormContext();

  const valorBien = Number(watch('valorBien')) || 0;
  const plazo = Number(watch('plazo')) || 24;
  const tasaAnual = Number(watch('tasaAnual')) || 0.36;
  const nivelRiesgo = (watch('nivelRiesgo') as 'A' | 'B' | 'C') || 'A';
  const comisionAperturaPct = Number(watch('_comisionAperturaPct')) || 0.05;
  const gpsInstalacion = Number(watch('gpsInstalacion')) || 0;
  const valorResidualPct = Number(watch('_valorResidualPct')) || 0.01;
  const seguroAnual = Number(watch('seguroAnual')) || 0;
  const rentaInicial = Number(watch('rentaInicial')) || 0;

  const preset = RISK_PRESETS[nivelRiesgo] ?? RISK_PRESETS.A;
  const enganche = valorBien * preset.enganche;
  const depositoGarantia = valorBien * preset.deposito;
  const comisionApertura = valorBien * comisionAperturaPct;
  const valorResidual = valorBien * valorResidualPct;
  const baseFinanciar =
    valorBien - enganche + comisionApertura + gpsInstalacion;
  const montoFinanciar = baseFinanciar > 0 ? baseFinanciar : 0;
  const rentaMensual = useMemo(
    () => pmt(tasaAnual / 12, plazo, montoFinanciar),
    [tasaAnual, plazo, montoFinanciar],
  );
  const rentaMensualIVA = Math.round(rentaMensual * 1.16 * 100) / 100;

  // Sincronizar derivados al form state para que el POST los lleve.
  useEffect(() => {
    setValue('enganche', enganche, { shouldDirty: true });
    setValue('depositoGarantia', depositoGarantia, { shouldDirty: true });
    setValue('comisionApertura', comisionApertura, { shouldDirty: true });
    setValue('valorResidual', valorResidual, { shouldDirty: true });
    setValue('montoFinanciar', montoFinanciar, { shouldDirty: true });
    setValue('rentaMensual', rentaMensual, { shouldDirty: true });
    setValue('rentaMensualIVA', rentaMensualIVA, { shouldDirty: true });
  }, [
    enganche,
    depositoGarantia,
    comisionApertura,
    valorResidual,
    montoFinanciar,
    rentaMensual,
    rentaMensualIVA,
    setValue,
  ]);

  return (
    <>
      <FormSection
        title="Parámetros financieros"
        description="Los cálculos se actualizan al vuelo y se guardan con el contrato."
      >
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <TextField
            path="valorBien"
            label="Valor del bien (sin IVA)"
            type="number"
            required
            help="Mínimo $150,000 MXN"
          />
          <SelectField
            path="plazo"
            label="Plazo"
            options={plazoOptions}
          />
          <TextField
            path="tasaAnual"
            label="Tasa anual"
            type="number"
            help={`${(tasaAnual * 100).toFixed(2)}% anual`}
          />
          <div>
            <label className="block text-sm font-medium text-gray-600 mb-1">
              Comisión de apertura
            </label>
            <input
              type="number"
              step={0.01}
              min={0}
              max={0.2}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm outline-none focus:ring-2 focus:ring-inyecta-500 focus:border-inyecta-500"
              {...register('_comisionAperturaPct', { valueAsNumber: true })}
            />
            <p className="mt-1 text-xs text-gray-500">
              {(comisionAperturaPct * 100).toFixed(1)}% ={' '}
              {formatCurrency(comisionApertura)}
            </p>
          </div>
          <TextField
            path="gpsInstalacion"
            label="GPS Instalación"
            type="number"
          />
          <TextField
            path="seguroAnual"
            label="Seguro anual"
            type="number"
            help={seguroAnual ? formatCurrency(seguroAnual) : undefined}
          />
          <div>
            <label className="block text-sm font-medium text-gray-600 mb-1">
              Valor residual (%)
            </label>
            <input
              type="number"
              step={0.01}
              min={0}
              max={1}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm outline-none focus:ring-2 focus:ring-inyecta-500 focus:border-inyecta-500"
              {...register('_valorResidualPct', { valueAsNumber: true })}
            />
            <p className="mt-1 text-xs text-gray-500">
              {(valorResidualPct * 100).toFixed(1)}% ={' '}
              {formatCurrency(valorResidual)}
            </p>
          </div>
          <TextField
            path="rentaInicial"
            label="Renta inicial"
            type="number"
            help={rentaInicial ? formatCurrency(rentaInicial) : undefined}
          />
        </div>
      </FormSection>

      {valorBien >= 150000 && (
        <div className="bg-inyecta-50 rounded-xl border border-inyecta-200 p-6">
          <div className="flex items-center gap-2 mb-4">
            <Calculator size={18} className="text-inyecta-700" />
            <h3 className="font-semibold text-inyecta-900">
              Resumen calculado
            </h3>
          </div>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <div>
              <p className="text-xs text-inyecta-600">
                Enganche ({(preset.enganche * 100).toFixed(0)}%)
              </p>
              <p className="font-bold text-gray-900">{formatCurrency(enganche)}</p>
            </div>
            <div>
              <p className="text-xs text-inyecta-600">
                Depósito garantía ({(preset.deposito * 100).toFixed(0)}%)
              </p>
              <p className="font-bold text-gray-900">
                {formatCurrency(depositoGarantia)}
              </p>
            </div>
            <div>
              <p className="text-xs text-inyecta-600">Monto a financiar</p>
              <p className="font-bold text-gray-900">
                {formatCurrency(montoFinanciar)}
              </p>
            </div>
            <div>
              <p className="text-xs text-inyecta-600">Renta mensual + IVA</p>
              <p className="font-bold text-inyecta-700 text-lg">
                {formatCurrency(rentaMensualIVA)}
              </p>
            </div>
          </div>
        </div>
      )}

      <FormSection
        title="Datos de la solicitud"
        description="Metadatos de la operación para el expediente CNBV."
      >
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <TextField
            path="lugarSolicitud"
            label="Lugar de la solicitud"
            placeholder="Ej: Ciudad de México"
          />
          <TextField
            path="fechaSolicitud"
            label="Fecha de la solicitud"
            type="date"
          />
          <TextField
            path="promotor"
            label="Promotor / ejecutivo"
            placeholder="Nombre del comercial"
          />
          <TextField
            path="montoSolicitado"
            label="Monto solicitado"
            type="number"
            help="Importe que el cliente declara solicitar. Puede diferir del monto a financiar calculado."
          />
          <TextAreaField
            path="destinoArrendamiento"
            label="Destino del arrendamiento"
            placeholder="¿Para qué se va a usar el bien arrendado?"
            rows={2}
            className="lg:col-span-2"
          />
        </div>
      </FormSection>
    </>
  );
}
