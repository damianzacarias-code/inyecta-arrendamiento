// Paso 4 — Accionistas / socios (solo PM).
//
// Reglas que aplica el schema:
//   - Al menos un socio declarado.
//   - Σ porcentajes ≤ 100.
//   - Al menos uno con esRepLegal=true (recomendado, no hard-enforced
//     aquí — el schema lo deja como recomendación; el frontend muestra
//     un aviso si no hay ninguno marcado).
//
// Este paso NO se renderiza en PFAE; el WizardShell lo omite.

import { useFieldArray, useFormContext } from 'react-hook-form';
import { Plus, Trash2, AlertCircle } from 'lucide-react';
import {
  CheckboxField,
  FormSection,
  SelectField,
  TextField,
} from '@/components/wizard/fields';
import {
  estadoCivilOptions,
  estadosOptions,
  generoOptions,
  regimenMatrimonialOptions,
} from './constants';

export function Step4Accionistas() {
  const { control, watch } = useFormContext();
  const { fields, append, remove } = useFieldArray({
    control,
    name: 'socios',
  });

  const socios = (watch('socios') as Array<{
    porcentaje?: number | string;
    esRepLegal?: boolean;
    estadoCivil?: 'SOLTERO' | 'CASADO';
  }>) ?? [];

  const totalPorcentaje = socios.reduce(
    (s, x) => s + (Number(x.porcentaje) || 0),
    0,
  );
  const algunoEsRL = socios.some((s) => s.esRepLegal);

  const handleAgregar = () =>
    append({
      nombre: '',
      apellidoPaterno: '',
      porcentaje: 0,
      esRepLegal: false,
    });

  return (
    <>
      <FormSection
        title="Estructura accionaria"
        description="Declara a los socios con participación en la persona moral. La suma de porcentajes no puede exceder 100%."
      >
        <div className="flex items-center justify-between mb-4">
          <div className="text-sm text-gray-600">
            {fields.length} socio{fields.length === 1 ? '' : 's'} declarado
            {fields.length === 1 ? '' : 's'} · Suma:{' '}
            <span
              className={
                totalPorcentaje > 100
                  ? 'font-semibold text-red-600'
                  : 'font-semibold text-gray-900'
              }
            >
              {totalPorcentaje.toFixed(2)}%
            </span>
          </div>
          <button
            type="button"
            onClick={handleAgregar}
            className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg bg-inyecta-700 hover:bg-inyecta-800 text-white text-xs font-medium transition-colors"
          >
            <Plus size={14} /> Agregar socio
          </button>
        </div>

        {fields.length === 0 && (
          <div className="border border-dashed border-gray-300 rounded-xl p-8 text-center text-sm text-gray-500">
            Aún no hay socios. Usa “Agregar socio” para registrar el primero.
          </div>
        )}

        {totalPorcentaje > 100 && (
          <div className="mb-4 bg-red-50 border border-red-200 text-red-700 px-4 py-2 rounded-lg text-xs flex items-center gap-2">
            <AlertCircle size={14} />
            La suma de porcentajes excede 100%. Ajusta las participaciones antes
            de guardar.
          </div>
        )}

        {fields.length > 0 && !algunoEsRL && (
          <div className="mb-4 bg-amber-50 border border-amber-200 text-amber-800 px-4 py-2 rounded-lg text-xs flex items-center gap-2">
            <AlertCircle size={14} />
            Recomendado: marcar al menos a un socio como representante legal.
          </div>
        )}

        <div className="space-y-6">
          {fields.map((field, index) => {
            const estadoCivil = socios[index]?.estadoCivil;
            return (
              <div
                key={field.id}
                className="bg-gray-50 border border-gray-200 rounded-xl p-5"
              >
                <div className="flex items-center justify-between mb-4">
                  <h4 className="font-medium text-gray-900">
                    Socio #{index + 1}
                  </h4>
                  <button
                    type="button"
                    onClick={() => remove(index)}
                    className="inline-flex items-center gap-1 text-xs text-red-600 hover:text-red-700"
                  >
                    <Trash2 size={12} /> Eliminar
                  </button>
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                  <TextField
                    path={`socios.${index}.nombre`}
                    label="Nombre(s)"
                    required
                    uppercase
                  />
                  <TextField
                    path={`socios.${index}.apellidoPaterno`}
                    label="Apellido paterno"
                    required
                    uppercase
                  />
                  <TextField
                    path={`socios.${index}.apellidoMaterno`}
                    label="Apellido materno"
                    uppercase
                  />
                  <SelectField
                    path={`socios.${index}.genero`}
                    label="Género"
                    options={generoOptions}
                  />
                  <TextField
                    path={`socios.${index}.rfc`}
                    label="RFC"
                    uppercase
                    monospace
                    maxLength={13}
                  />
                  <TextField
                    path={`socios.${index}.curp`}
                    label="CURP"
                    uppercase
                    monospace
                    maxLength={18}
                  />
                  <TextField
                    path={`socios.${index}.porcentaje`}
                    label="% participación"
                    type="number"
                    required
                    placeholder="0.00"
                  />
                  <TextField
                    path={`socios.${index}.anosExperiencia`}
                    label="Años de experiencia"
                    type="number"
                  />
                  <div className="lg:col-span-2">
                    <CheckboxField
                      path={`socios.${index}.esRepLegal`}
                      label="Es representante legal"
                      help="Al menos un socio debería serlo."
                    />
                  </div>

                  <TextField
                    path={`socios.${index}.razonSocial`}
                    label="Razón social (si el socio es persona moral)"
                    uppercase
                    className="lg:col-span-2"
                  />
                  <TextField
                    path={`socios.${index}.fechaInscripcionEscrituraConst`}
                    label="Fecha de inscripción de escritura constitutiva"
                    type="date"
                  />
                  <TextField
                    path={`socios.${index}.folioInscripcionEscrituraConst`}
                    label="Folio de inscripción"
                    uppercase
                  />

                  <TextField
                    path={`socios.${index}.fechaNacimiento`}
                    label="Fecha de nacimiento"
                    type="date"
                  />
                  <TextField
                    path={`socios.${index}.lugarNacimiento`}
                    label="Lugar de nacimiento"
                    uppercase
                  />
                  <TextField
                    path={`socios.${index}.nacionalidad`}
                    label="Nacionalidad"
                    placeholder="Mexicana"
                  />
                  <SelectField
                    path={`socios.${index}.estadoCivil`}
                    label="Estado civil"
                    options={estadoCivilOptions}
                  />
                  {estadoCivil === 'CASADO' && (
                    <>
                      <SelectField
                        path={`socios.${index}.regimenMatrimonial`}
                        label="Régimen matrimonial"
                        required
                        options={regimenMatrimonialOptions}
                      />
                      <TextField
                        path={`socios.${index}.nombreConyuge`}
                        label="Nombre del cónyuge"
                        required
                        uppercase
                      />
                    </>
                  )}

                  <TextField
                    path={`socios.${index}.telefonoCelular`}
                    label="Teléfono celular"
                    type="tel"
                  />
                  <TextField
                    path={`socios.${index}.email`}
                    label="Correo electrónico"
                    type="email"
                  />
                </div>

                {/* Domicilio del socio — compacto, sin sección separada */}
                <details className="mt-4">
                  <summary className="cursor-pointer text-xs font-medium text-inyecta-700 hover:text-inyecta-800">
                    Domicilio del socio (opcional)
                  </summary>
                  <div className="grid grid-cols-1 lg:grid-cols-6 gap-4 mt-3">
                    <TextField
                      path={`socios.${index}.calle`}
                      label="Calle"
                      uppercase
                      className="lg:col-span-4"
                    />
                    <TextField
                      path={`socios.${index}.numExterior`}
                      label="No. ext"
                    />
                    <TextField
                      path={`socios.${index}.numInterior`}
                      label="No. int"
                    />
                    <TextField
                      path={`socios.${index}.colonia`}
                      label="Colonia"
                      uppercase
                      className="lg:col-span-3"
                    />
                    <TextField
                      path={`socios.${index}.cp`}
                      label="C.P."
                      maxLength={5}
                    />
                    <TextField
                      path={`socios.${index}.municipio`}
                      label="Municipio"
                      uppercase
                      className="lg:col-span-2"
                    />
                    <TextField
                      path={`socios.${index}.ciudad`}
                      label="Ciudad"
                      uppercase
                      className="lg:col-span-3"
                    />
                    <SelectField
                      path={`socios.${index}.estado`}
                      label="Estado"
                      options={estadosOptions}
                      className="lg:col-span-3"
                    />
                  </div>
                </details>
              </div>
            );
          })}
        </div>
      </FormSection>
    </>
  );
}
