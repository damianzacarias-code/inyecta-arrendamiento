// Paso 3 — KYC (CNBV): proveedor del bien + perfil transaccional +
// terceros (beneficiario/aportante) + declaraciones PEP.
//
// Reglas condicionales relevantes (enforced por el schema del server
// y por el mirror del cliente):
//   - Perfil: si realizaPagosEfectivo=true → exige efectivoMotivos +
//     efectivoMontoMensual
//   - Terceros: si tercer*Existe=true → exige la info correspondiente
//   - PEP: si esPep=true → exige dependencia + puesto + periodo +
//     funciones. Si tipo=PARIENTE → también nombre + parentesco.

import { useFieldArray, useFormContext } from 'react-hook-form';
import { AlertCircle, Plus, Trash2 } from 'lucide-react';
import {
  CheckboxField,
  FormSection,
  RadioBoolField,
  SelectField,
  TextAreaField,
  TextField,
} from '@/components/wizard/fields';
import {
  frecuenciaOptions,
  montoRangoOptions,
  numOpsRangoOptions,
  pepTipoLabels,
  pepTipoOptions,
} from './constants';

export function Step3Kyc() {
  const { control, watch } = useFormContext();

  const realizaEfectivo = watch('perfilTransaccional.realizaPagosEfectivo');
  const tercerBenef = watch('tercerBeneficiarioExiste');
  const tercerAport = watch('tercerAportanteExiste');

  const {
    fields: pepFields,
    append: appendPep,
    remove: removePep,
  } = useFieldArray({ control, name: 'declaracionesPEP' });

  const pepTipos = (watch('declaracionesPEP') as
    | Array<{ tipo?: string; esPep?: boolean }>
    | undefined) ?? [];

  // Detectar tipos PEP ya usados para prevenir duplicados (el schema
  // también lo enforcea, pero aquí ocultamos del menú los repetidos).
  const tiposUsados = new Set(pepTipos.map((p) => p?.tipo).filter(Boolean));
  const tiposDisponibles = pepTipoOptions.filter(
    (o) => !tiposUsados.has(o.value),
  );

  return (
    <>
      <FormSection
        title="Proveedor del bien"
        description="Origen del activo que se va a arrendar. Puede ser distinto al que capturaste en datos del bien."
      >
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <TextField
            path="proveedor.nombre"
            label="Razón social / nombre"
            required
            className="lg:col-span-2"
          />
          <TextField
            path="proveedor.nombreContacto"
            label="Nombre de contacto"
          />
          <TextField
            path="proveedor.telefono"
            label="Teléfono"
            type="tel"
          />
          <TextField
            path="proveedor.email"
            label="Correo electrónico"
            type="email"
            className="lg:col-span-2"
          />
        </div>
      </FormSection>

      <FormSection
        title="Perfil transaccional"
        description="Expectativas de uso del producto por el cliente (KYC / PLD)."
      >
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <TextAreaField
            path="perfilTransaccional.productosQueAdquirira"
            label="Productos que adquirirá"
            rows={2}
            className="lg:col-span-2"
          />
          <TextAreaField
            path="perfilTransaccional.origenRecursos"
            label="Origen de los recursos"
            rows={2}
            placeholder="Ej: Ventas del giro, ingresos por servicios..."
          />
          <TextAreaField
            path="perfilTransaccional.destinoRecursos"
            label="Destino de los recursos"
            rows={2}
            placeholder="Ej: Pago de rentas mensuales del arrendamiento"
          />
          <SelectField
            path="perfilTransaccional.montoMensualRango"
            label="Monto mensual estimado"
            options={montoRangoOptions}
          />
          <SelectField
            path="perfilTransaccional.frecuencia"
            label="Frecuencia transaccional"
            options={frecuenciaOptions}
          />
          <SelectField
            path="perfilTransaccional.numOperacionesRango"
            label="Número de operaciones"
            options={numOpsRangoOptions}
            className="lg:col-span-2"
          />
          <div className="lg:col-span-2">
            <RadioBoolField
              path="perfilTransaccional.realizaPagosEfectivo"
              label="¿Realiza pagos en efectivo?"
            />
          </div>
          {realizaEfectivo === true && (
            <>
              <TextAreaField
                path="perfilTransaccional.efectivoMotivos"
                label="Motivos del pago en efectivo"
                rows={2}
                required
                className="lg:col-span-2"
              />
              <TextField
                path="perfilTransaccional.efectivoMontoMensual"
                label="Monto mensual en efectivo"
                type="number"
                required
              />
            </>
          )}
        </div>
      </FormSection>

      <FormSection
        title="Terceros"
        description="Declaración de beneficiario final y aportante de recursos."
      >
        <div className="space-y-4">
          <div className="p-4 rounded-lg border border-gray-200">
            <RadioBoolField
              path="tercerBeneficiarioExiste"
              label="¿Existe un tercer beneficiario?"
              help="Persona que recibirá el uso/beneficio del bien sin ser el arrendatario."
            />
            {tercerBenef === true && (
              <div className="mt-3">
                <TextAreaField
                  path="tercerBeneficiarioInfo"
                  label="Información del tercer beneficiario"
                  rows={2}
                  required
                />
              </div>
            )}
          </div>

          <div className="p-4 rounded-lg border border-gray-200">
            <RadioBoolField
              path="tercerAportanteExiste"
              label="¿Existe un tercer aportante?"
              help="Persona que aporta recursos para la operación sin ser el arrendatario."
            />
            {tercerAport === true && (
              <div className="mt-3">
                <TextAreaField
                  path="tercerAportanteInfo"
                  label="Información del tercer aportante"
                  rows={2}
                  required
                />
              </div>
            )}
          </div>
        </div>
      </FormSection>

      <FormSection
        title="Declaración PEP"
        description="Persona Expuesta Políticamente. Registra una declaración por cada tipo aplicable (solicitante, pariente, socio/accionista)."
      >
        <div className="flex items-center justify-between mb-4">
          <div className="text-sm text-gray-600">
            {pepFields.length} declaración
            {pepFields.length === 1 ? '' : 'es'} registrada
            {pepFields.length === 1 ? '' : 's'}
          </div>
          <button
            type="button"
            onClick={() =>
              appendPep({
                tipo: tiposDisponibles[0]?.value ?? 'SOLICITANTE',
                esPep: false,
              })
            }
            disabled={tiposDisponibles.length === 0}
            className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg bg-inyecta-700 hover:bg-inyecta-800 disabled:bg-gray-300 text-white text-xs font-medium transition-colors"
          >
            <Plus size={14} /> Agregar declaración
          </button>
        </div>

        {pepFields.length === 0 && (
          <div className="border border-dashed border-gray-300 rounded-xl p-6 text-center text-sm text-gray-500">
            <div className="flex items-center justify-center gap-2 mb-1">
              <AlertCircle size={14} />
              <span>Sin declaraciones registradas</span>
            </div>
            <p className="text-xs">
              Agrega al menos una declaración por cada sujeto PEP aplicable
              (solicitante, pariente, socio/accionista). Si ninguno aplica,
              registra “El solicitante” con “No es PEP”.
            </p>
          </div>
        )}

        <div className="space-y-4">
          {pepFields.map((field, idx) => {
            const tipo = pepTipos[idx]?.tipo;
            const esPep = pepTipos[idx]?.esPep;
            const tipoOptionsPorSlot = pepTipoOptions.filter(
              (o) => o.value === tipo || !tiposUsados.has(o.value),
            );

            return (
              <div
                key={field.id}
                className="bg-gray-50 border border-gray-200 rounded-xl p-5"
              >
                <div className="flex items-center justify-between mb-4">
                  <h4 className="font-medium text-gray-900">
                    Declaración #{idx + 1}
                    {tipo ? ` · ${pepTipoLabels[tipo] ?? tipo}` : ''}
                  </h4>
                  <button
                    type="button"
                    onClick={() => removePep(idx)}
                    className="inline-flex items-center gap-1 text-xs text-red-600 hover:text-red-700"
                  >
                    <Trash2 size={12} /> Eliminar
                  </button>
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                  <SelectField
                    path={`declaracionesPEP.${idx}.tipo`}
                    label="Sujeto"
                    required
                    options={tipoOptionsPorSlot}
                  />
                  <div>
                    <RadioBoolField
                      path={`declaracionesPEP.${idx}.esPep`}
                      label="¿Es PEP?"
                    />
                  </div>

                  {esPep === true && (
                    <>
                      {tipo === 'PARIENTE' && (
                        <>
                          <TextField
                            path={`declaracionesPEP.${idx}.nombre`}
                            label="Nombre del pariente PEP"
                            required
                            uppercase
                          />
                          <TextField
                            path={`declaracionesPEP.${idx}.parentesco`}
                            label="Parentesco con el titular"
                            required
                            placeholder="Ej: Padre, cónyuge"
                          />
                        </>
                      )}
                      <TextField
                        path={`declaracionesPEP.${idx}.dependencia`}
                        label="Dependencia / institución"
                        required
                      />
                      <TextField
                        path={`declaracionesPEP.${idx}.puesto`}
                        label="Puesto"
                        required
                      />
                      <TextField
                        path={`declaracionesPEP.${idx}.periodoEjercicio`}
                        label="Periodo de ejercicio"
                        required
                        placeholder="Ej: 2020-2024"
                      />
                      <TextAreaField
                        path={`declaracionesPEP.${idx}.principalesFunciones`}
                        label="Principales funciones"
                        required
                        rows={2}
                        className="lg:col-span-2"
                      />
                    </>
                  )}
                </div>
              </div>
            );
          })}
        </div>

        <div className="mt-4 text-xs text-gray-500">
          <CheckboxField
            path="_ningunoPep"
            label="Ningún sujeto relacionado es una Persona Expuesta Políticamente"
            help="Marcalo sólo como confirmación; asegúrate de tener al menos una declaración tipo SOLICITANTE con esPep=No para que el expediente quede completo."
          />
        </div>
      </FormSection>
    </>
  );
}
