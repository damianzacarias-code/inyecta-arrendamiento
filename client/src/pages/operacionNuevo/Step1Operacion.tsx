// Paso 1 — Contexto de la operación.
//
// Selección del cliente, producto (PURO / FINANCIERO), nivel de riesgo
// y datos del bien. La selección de cliente es crítica para Step 4
// (Avales) porque los obligados solidarios viven colgados del Client.

import { useFormContext } from 'react-hook-form';
import { clsx } from 'clsx';
import { FormSection, SelectField, TextField } from '@/components/wizard/fields';
import {
  bienEstadoOptions,
  nivelRiesgoOptions,
  productoOptions,
} from './constants';
import {
  ClienteSelector,
  type ClientOption,
} from './ClienteSelector';

interface Props {
  /** Cliente actualmente seleccionado (gestionado por el wizard padre). */
  cliente: ClientOption | null;
  onClienteChange: (c: ClientOption | null) => void;
}

export function Step1Operacion({ cliente, onClienteChange }: Props) {
  const { watch, setValue } = useFormContext();
  const producto = watch('producto') as 'PURO' | 'FINANCIERO' | undefined;
  const nivelRiesgo = watch('nivelRiesgo') as 'A' | 'B' | 'C' | undefined;

  return (
    <>
      <FormSection
        title="Cliente"
        description="Selecciona el arrendatario titular de la operación."
      >
        <ClienteSelector
          selected={cliente}
          onSelect={(c) => {
            onClienteChange(c);
            setValue('clientId', c?.id ?? '', {
              shouldDirty: true,
              shouldValidate: true,
            });
          }}
        />
      </FormSection>

      <FormSection
        title="Producto y nivel de riesgo"
        description="El nivel de riesgo determina los presets de enganche y depósito en garantía."
      >
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div>
            <label className="block text-sm font-medium text-gray-600 mb-2">
              Tipo de arrendamiento
            </label>
            <div className="flex gap-2">
              {productoOptions.map((p) => {
                const active = producto === p.value;
                return (
                  <button
                    key={p.value}
                    type="button"
                    onClick={() =>
                      setValue('producto', p.value, { shouldDirty: true })
                    }
                    className={clsx(
                      'flex-1 px-3 py-2 rounded-lg border-2 text-sm font-medium transition-colors',
                      active && p.value === 'PURO' &&
                        'border-cyan-300 bg-cyan-50 text-cyan-700',
                      active && p.value === 'FINANCIERO' &&
                        'border-violet-300 bg-violet-50 text-violet-700',
                      !active && 'border-gray-200 text-gray-500 hover:border-gray-300',
                    )}
                  >
                    {p.label}
                  </button>
                );
              })}
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-600 mb-2">
              Nivel de riesgo
            </label>
            <div className="flex gap-2">
              {nivelRiesgoOptions.map((r) => {
                const active = nivelRiesgo === r.value;
                return (
                  <button
                    key={r.value}
                    type="button"
                    onClick={() =>
                      setValue('nivelRiesgo', r.value, { shouldDirty: true })
                    }
                    className={clsx(
                      'flex-1 px-3 py-2 rounded-lg border-2 text-sm font-medium transition-colors',
                      active
                        ? 'border-inyecta-300 bg-inyecta-50 text-inyecta-700'
                        : 'border-gray-200 text-gray-500 hover:border-gray-300',
                    )}
                  >
                    {r.label}
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      </FormSection>

      <FormSection
        title="Datos del bien"
        description="Descripción del equipo, vehículo o maquinaria a arrendar."
      >
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <TextField
            path="bienDescripcion"
            label="Descripción"
            required
            placeholder="Ej: Camión Freightliner Cascadia 2025"
            className="lg:col-span-2"
          />
          <TextField path="bienMarca" label="Marca" />
          <TextField path="bienModelo" label="Modelo" />
          <TextField path="bienAnio" label="Año" type="number" />
          <TextField
            path="bienNumSerie"
            label="Número de serie"
            monospace
            uppercase
          />
          <SelectField
            path="bienEstado"
            label="Estado del bien"
            options={bienEstadoOptions}
          />
          <TextField
            path="proveedorLegacy"
            label="Proveedor (nombre corto)"
            help="Se capturan más detalles del proveedor en el paso KYC."
          />
        </div>
      </FormSection>
    </>
  );
}
