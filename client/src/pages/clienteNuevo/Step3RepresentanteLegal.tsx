// Paso 3 — Representante Legal (apoderado).
//
//  • PFAE: opcional — checkbox "desea declarar un representante" y al
//    apagarlo limpiamos el subtree representanteLegal.* para que no
//    entre al POST.
//  • PM  : obligatorio, el checkbox se omite. Además exige
//    fechaInscripcionPoderes + folioInscripcionPoderes (se valida en
//    el schema parent).
//
//  • Estado civil CASADO muestra régimen + nombre del cónyuge
//    (regla transversal CNBV vía refineEstadoCivil).

import { useEffect } from 'react';
import { useFormContext } from 'react-hook-form';
import { FormSection, SelectField, TextField } from '@/components/wizard/fields';
import {
  estadoCivilOptions,
  estadosOptions,
  generoOptions,
  regimenMatrimonialOptions,
  situacionInstalacionesOptions,
} from './constants';

export function Step3RepresentanteLegal() {
  const { watch, setValue, register } = useFormContext();
  const tipo = watch('tipo') as 'PFAE' | 'PM';
  const declarar = watch('_declararRL') as boolean | undefined;
  const estadoCivil = watch('representanteLegal.estadoCivil');

  // En PM siempre se declara; cerramos el flag para que render lo muestre.
  useEffect(() => {
    if (tipo === 'PM' && !declarar) {
      setValue('_declararRL', true, { shouldDirty: false });
    }
  }, [tipo, declarar, setValue]);

  // Si se desmarca el checkbox en PFAE, limpiamos el sub-objeto para
  // que el schema parent no lo evalúe.
  useEffect(() => {
    if (!declarar && tipo === 'PFAE') {
      setValue('representanteLegal', undefined, { shouldDirty: true });
    }
  }, [declarar, tipo, setValue]);

  const mostrar = tipo === 'PM' || declarar;

  return (
    <>
      {tipo === 'PFAE' && (
        <FormSection
          title="¿Declarar representante legal?"
          description="Si el arrendatario mismo firmará todo, deja esta opción apagada."
        >
          <label className="flex items-start gap-2 cursor-pointer">
            <input
              type="checkbox"
              className="mt-1 h-4 w-4 rounded border-gray-300 text-inyecta-600 focus:ring-inyecta-500"
              {...register('_declararRL')}
            />
            <div>
              <div className="text-sm text-gray-800">
                Sí, registrar un representante legal distinto al titular
              </div>
              <div className="text-xs text-gray-500">
                Útil cuando un apoderado firma por la persona física.
              </div>
            </div>
          </label>
        </FormSection>
      )}

      {mostrar && (
        <>
          <FormSection
            title="Identidad del representante legal"
            description={
              tipo === 'PM'
                ? 'Obligatorio para persona moral. Debe coincidir con el apoderado de las escrituras.'
                : 'Datos de la persona autorizada para actuar en nombre del titular.'
            }
          >
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              <TextField
                path="representanteLegal.nombre"
                label="Nombre(s)"
                required
                uppercase
              />
              <TextField
                path="representanteLegal.apellidoPaterno"
                label="Apellido paterno"
                required
                uppercase
              />
              <TextField
                path="representanteLegal.apellidoMaterno"
                label="Apellido materno"
                uppercase
              />
              <SelectField
                path="representanteLegal.genero"
                label="Género"
                options={generoOptions}
              />
              <TextField
                path="representanteLegal.rfc"
                label="RFC"
                uppercase
                monospace
                maxLength={13}
              />
              <TextField
                path="representanteLegal.curp"
                label="CURP"
                uppercase
                monospace
                maxLength={18}
              />
              <TextField
                path="representanteLegal.fiel"
                label="FIEL / e.firma"
              />
              <TextField
                path="representanteLegal.ocupacion"
                label="Ocupación"
              />
              <TextField
                path="representanteLegal.anosExperiencia"
                label="Años de experiencia"
                type="number"
              />
            </div>
          </FormSection>

          <FormSection title="Nacimiento y nacionalidad">
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
              <TextField
                path="representanteLegal.fechaNacimiento"
                label="Fecha de nacimiento"
                type="date"
              />
              <TextField
                path="representanteLegal.lugarNacimiento"
                label="Lugar de nacimiento"
                uppercase
              />
              <TextField
                path="representanteLegal.nacionalidad"
                label="Nacionalidad"
                placeholder="Mexicana"
              />
            </div>
          </FormSection>

          <FormSection title="Estado civil">
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
              <SelectField
                path="representanteLegal.estadoCivil"
                label="Estado civil"
                options={estadoCivilOptions}
              />
              {estadoCivil === 'CASADO' && (
                <>
                  <SelectField
                    path="representanteLegal.regimenMatrimonial"
                    label="Régimen matrimonial"
                    required
                    options={regimenMatrimonialOptions}
                  />
                  <TextField
                    path="representanteLegal.nombreConyuge"
                    label="Nombre del cónyuge"
                    required
                    uppercase
                  />
                </>
              )}
            </div>
          </FormSection>

          <FormSection title="Domicilio del representante">
            <div className="grid grid-cols-1 lg:grid-cols-6 gap-4">
              <TextField
                path="representanteLegal.calle"
                label="Calle"
                uppercase
                className="lg:col-span-4"
              />
              <TextField
                path="representanteLegal.numExterior"
                label="No. exterior"
              />
              <TextField
                path="representanteLegal.numInterior"
                label="No. interior"
              />
              <TextField
                path="representanteLegal.colonia"
                label="Colonia"
                uppercase
                className="lg:col-span-3"
              />
              <TextField
                path="representanteLegal.cp"
                label="C.P."
                maxLength={5}
              />
              <TextField
                path="representanteLegal.municipio"
                label="Municipio / Alcaldía"
                uppercase
                className="lg:col-span-2"
              />
              <TextField
                path="representanteLegal.ciudad"
                label="Ciudad"
                uppercase
                className="lg:col-span-3"
              />
              <SelectField
                path="representanteLegal.estado"
                label="Estado"
                options={estadosOptions}
                className="lg:col-span-3"
              />
              <SelectField
                path="representanteLegal.situacionInstalaciones"
                label="Situación del domicilio"
                options={situacionInstalacionesOptions}
                className="lg:col-span-3"
              />
              <TextField
                path="representanteLegal.tiempoResidenciaAnos"
                label="Años de residencia"
                type="number"
                className="lg:col-span-3"
              />
            </div>
          </FormSection>

          <FormSection title="Contacto">
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
              <TextField
                path="representanteLegal.telefonoFijo"
                label="Teléfono fijo"
                type="tel"
              />
              <TextField
                path="representanteLegal.telefonoCelular"
                label="Teléfono celular"
                type="tel"
              />
              <TextField
                path="representanteLegal.email"
                label="Correo electrónico"
                type="email"
              />
            </div>
          </FormSection>

          {tipo === 'PM' && (
            <FormSection
              title="Inscripción de poderes en RPC"
              description="Requerido para persona moral — el RPC debe poder verificar los poderes."
            >
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                <TextField
                  path="representanteLegal.fechaInscripcionPoderes"
                  label="Fecha de inscripción"
                  type="date"
                  required
                />
                <TextField
                  path="representanteLegal.folioInscripcionPoderes"
                  label="Folio de inscripción"
                  required
                  uppercase
                />
              </div>
            </FormSection>
          )}
        </>
      )}
    </>
  );
}
