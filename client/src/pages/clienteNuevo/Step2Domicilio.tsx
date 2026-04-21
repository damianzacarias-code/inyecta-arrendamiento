// Paso 2 — Domicilio fiscal (obligatorio) + domicilio de operación.
//
// El "domicilio de operación" suele coincidir con el fiscal; por eso
// ofrecemos un checkbox que copia los campos fiscales al bloque de
// operación y oculta la segunda sección.

import { useEffect } from 'react';
import { useFormContext } from 'react-hook-form';
import { FormSection, SelectField, TextField } from '@/components/wizard/fields';
import { estadosOptions } from './constants';

/** Campos del domicilio fiscal que se espejean al de operación. */
const DOMICILIO_FIELDS = [
  'calle',
  'numExterior',
  'numInterior',
  'colonia',
  'municipio',
  'ciudad',
  'estado',
  'cp',
] as const;

const OP_FIELDS = [
  'calleOp',
  'numExteriorOp',
  'numInteriorOp',
  'coloniaOp',
  'municipioOp',
  'ciudadOp',
  'estadoOp',
  'cpOp',
] as const;

export function Step2Domicilio() {
  const { watch, setValue, register } = useFormContext();
  const mismoDomicilio = watch('_mismoDomicilioOp') as boolean | undefined;
  const fiscal = DOMICILIO_FIELDS.map((f) => watch(f));

  // Cuando se activa el checkbox, copia el domicilio fiscal completo al de
  // operación. Si el usuario luego edita un campo fiscal, mantenemos la
  // sincronía mientras el checkbox siga activo.
  useEffect(() => {
    if (!mismoDomicilio) return;
    DOMICILIO_FIELDS.forEach((_f, i) => {
      const opKey = OP_FIELDS[i];
      setValue(opKey, fiscal[i], { shouldDirty: true, shouldValidate: false });
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mismoDomicilio, ...fiscal]);

  return (
    <>
      <FormSection
        title="Domicilio fiscal"
        description="Debe coincidir con la constancia de situación fiscal."
      >
        <div className="grid grid-cols-1 lg:grid-cols-6 gap-4">
          <TextField
            path="calle"
            label="Calle"
            required
            uppercase
            className="lg:col-span-4"
          />
          <TextField path="numExterior" label="No. exterior" required />
          <TextField path="numInterior" label="No. interior" />
          <TextField
            path="colonia"
            label="Colonia"
            required
            uppercase
            className="lg:col-span-3"
          />
          <TextField path="cp" label="Código postal" required maxLength={5} />
          <TextField
            path="municipio"
            label="Municipio / Alcaldía"
            required
            uppercase
            className="lg:col-span-2"
          />
          <TextField
            path="ciudad"
            label="Ciudad"
            uppercase
            className="lg:col-span-3"
          />
          <SelectField
            path="estado"
            label="Estado"
            required
            options={estadosOptions}
            className="lg:col-span-3"
          />
          <TextField
            path="pais"
            label="País"
            placeholder="México"
            className="lg:col-span-3"
          />
        </div>
      </FormSection>

      <FormSection
        title="Domicilio de operación"
        description="Sucursal, planta, bodega o punto de operación principal."
      >
        <label className="flex items-center gap-2 cursor-pointer mb-4">
          <input
            type="checkbox"
            className="h-4 w-4 rounded border-gray-300 text-inyecta-600 focus:ring-inyecta-500"
            {...register('_mismoDomicilioOp')}
          />
          <span className="text-sm text-gray-800">
            El domicilio de operación es el mismo que el fiscal
          </span>
        </label>

        {!mismoDomicilio && (
          <div className="grid grid-cols-1 lg:grid-cols-6 gap-4">
            <TextField
              path="calleOp"
              label="Calle"
              uppercase
              className="lg:col-span-4"
            />
            <TextField path="numExteriorOp" label="No. exterior" />
            <TextField path="numInteriorOp" label="No. interior" />
            <TextField
              path="coloniaOp"
              label="Colonia"
              uppercase
              className="lg:col-span-3"
            />
            <TextField path="cpOp" label="Código postal" maxLength={5} />
            <TextField
              path="municipioOp"
              label="Municipio / Alcaldía"
              uppercase
              className="lg:col-span-2"
            />
            <TextField
              path="ciudadOp"
              label="Ciudad"
              uppercase
              className="lg:col-span-3"
            />
            <SelectField
              path="estadoOp"
              label="Estado"
              options={estadosOptions}
              className="lg:col-span-3"
            />
          </div>
        )}
      </FormSection>
    </>
  );
}
