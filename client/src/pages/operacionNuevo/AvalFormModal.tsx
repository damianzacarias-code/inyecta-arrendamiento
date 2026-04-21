// Modal para crear un aval (Guarantor) nuevo sobre el cliente actual.
//
// El aval vive colgado del Client (reutilizable entre operaciones del
// mismo titular). Este modal solo CREA; la asignación al contrato
// (orden 1-3) sucede en Step4Avales después del create.
//
// Valida con createGuarantorSchema del mirror. Al éxito llama
// onCreated(guarantor) para que el parent refresque la lista.

import { useState } from 'react';
import { FormProvider, useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Loader2, X } from 'lucide-react';
import api from '@/lib/api';
import {
  CheckboxField,
  FormSection,
  SelectField,
  TextField,
} from '@/components/wizard/fields';
import {
  createGuarantorSchema,
  type CreateGuarantorInput,
} from '@/schemas/guarantor';
import {
  estadoCivilOptions,
  estadosOptions,
  generoOptions,
  regimenMatrimonialOptions,
} from '../clienteNuevo/constants';

interface Props {
  clientId: string;
  onClose: () => void;
  onCreated: (guarantor: { id: string; [k: string]: unknown }) => void;
}

type FormShape = CreateGuarantorInput & {
  _esPM?: boolean;
};

export function AvalFormModal({ clientId, onClose, onCreated }: Props) {
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const methods = useForm<FormShape>({
    resolver: zodResolver(createGuarantorSchema) as never,
    defaultValues: {
      _esPM: false,
    },
  });
  const { watch, handleSubmit } = methods;
  const esPM = watch('_esPM');
  const estadoCivil = watch('estadoCivil');

  const onSubmit = handleSubmit(async (values) => {
    setSubmitError(null);
    setSubmitting(true);
    try {
      const { _esPM, ...payload } = values;
      void _esPM;
      const res = await api.post(
        `/clients/${clientId}/guarantors`,
        payload,
      );
      onCreated(res.data);
    } catch (err: unknown) {
      const e = err as {
        response?: { data?: { error?: unknown; message?: string } };
      };
      const raw = e.response?.data?.error;
      if (typeof raw === 'string') setSubmitError(raw);
      else if (Array.isArray(raw)) {
        setSubmitError(
          raw
            .map((i: { path?: string[]; message?: string }) =>
              i?.path?.length
                ? `${i.path.join('.')}: ${i.message ?? ''}`
                : i.message ?? '',
            )
            .filter(Boolean)
            .join(' · '),
        );
      } else setSubmitError(e.response?.data?.message ?? 'Error al crear aval');
      setSubmitting(false);
    }
  });

  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-start justify-center overflow-y-auto py-10 px-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-3xl">
        <div className="flex items-center justify-between p-5 border-b border-gray-200 sticky top-0 bg-white rounded-t-2xl">
          <div>
            <h3 className="font-semibold text-gray-900">Nuevo aval</h3>
            <p className="text-xs text-gray-500">
              El aval se guarda en el cliente y queda disponible para futuras
              operaciones.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600"
          >
            <X size={20} />
          </button>
        </div>

        <FormProvider {...methods}>
          <form onSubmit={onSubmit} className="p-5 space-y-5">
            {submitError && (
              <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg text-sm">
                {submitError}
              </div>
            )}

            <FormSection title="Tipo de aval">
              <CheckboxField
                path="_esPM"
                label="El aval es una persona moral"
                help="Si lo marcas se requieren los datos del representante legal y las inscripciones de RPC."
              />
            </FormSection>

            {!esPM ? (
              <FormSection title="Identidad (persona física)">
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                  <TextField
                    path="nombre"
                    label="Nombre(s)"
                    required
                    uppercase
                  />
                  <TextField
                    path="apellidoPaterno"
                    label="Apellido paterno"
                    required
                    uppercase
                  />
                  <TextField
                    path="apellidoMaterno"
                    label="Apellido materno"
                    uppercase
                  />
                  <SelectField
                    path="genero"
                    label="Género"
                    options={generoOptions}
                  />
                  <TextField
                    path="rfc"
                    label="RFC"
                    uppercase
                    monospace
                    maxLength={13}
                  />
                  <TextField
                    path="curp"
                    label="CURP"
                    uppercase
                    monospace
                    maxLength={18}
                  />
                  <TextField path="relacion" label="Relación con el titular" />
                  <TextField path="fiel" label="FIEL / e.firma" />
                </div>
              </FormSection>
            ) : (
              <FormSection title="Datos de la persona moral">
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                  <TextField
                    path="razonSocial"
                    label="Razón social"
                    required
                    uppercase
                    className="lg:col-span-2"
                  />
                  <TextField
                    path="rfc"
                    label="RFC"
                    uppercase
                    monospace
                    maxLength={13}
                  />
                  <TextField path="fiel" label="FIEL / e.firma" />
                  <TextField
                    path="representanteNombre"
                    label="Nombre del representante"
                    required
                    uppercase
                  />
                  <TextField
                    path="representanteApellidoPaterno"
                    label="Apellido paterno del representante"
                    required
                    uppercase
                  />
                  <TextField
                    path="representanteApellidoMaterno"
                    label="Apellido materno del representante"
                    uppercase
                  />
                  <TextField
                    path="representanteRfc"
                    label="RFC del representante"
                    uppercase
                    monospace
                    maxLength={13}
                  />
                  <TextField
                    path="fechaInscripcionEscrituraConst"
                    label="Fecha inscripción escritura constitutiva"
                    type="date"
                    required
                  />
                  <TextField
                    path="folioInscripcionEscrituraConst"
                    label="Folio escritura constitutiva"
                    required
                    uppercase
                  />
                  <TextField
                    path="fechaInscripcionPoderes"
                    label="Fecha inscripción de poderes"
                    type="date"
                    required
                  />
                  <TextField
                    path="folioInscripcionPoderes"
                    label="Folio de poderes"
                    required
                    uppercase
                  />
                  <TextField path="relacion" label="Relación con el titular" />
                </div>
              </FormSection>
            )}

            <FormSection title="Estado civil / nacimiento (PF)">
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
                <SelectField
                  path="estadoCivil"
                  label="Estado civil"
                  options={estadoCivilOptions}
                />
                {estadoCivil === 'CASADO' && (
                  <>
                    <SelectField
                      path="regimenMatrimonial"
                      label="Régimen matrimonial"
                      required
                      options={regimenMatrimonialOptions}
                    />
                    <TextField
                      path="nombreConyuge"
                      label="Nombre del cónyuge"
                      required
                      uppercase
                    />
                  </>
                )}
                <TextField
                  path="fechaNacimiento"
                  label="Fecha de nacimiento"
                  type="date"
                />
                <TextField
                  path="lugarNacimiento"
                  label="Lugar de nacimiento"
                  uppercase
                />
                <TextField
                  path="nacionalidad"
                  label="Nacionalidad"
                  placeholder="Mexicana"
                />
              </div>
            </FormSection>

            <FormSection title="Domicilio del aval">
              <div className="grid grid-cols-1 lg:grid-cols-6 gap-4">
                <TextField
                  path="calle"
                  label="Calle"
                  uppercase
                  className="lg:col-span-4"
                />
                <TextField path="numExterior" label="No. ext" />
                <TextField path="numInterior" label="No. int" />
                <TextField
                  path="colonia"
                  label="Colonia"
                  uppercase
                  className="lg:col-span-3"
                />
                <TextField path="cp" label="C.P." maxLength={5} />
                <TextField
                  path="municipio"
                  label="Municipio"
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
                  options={estadosOptions}
                  className="lg:col-span-3"
                />
              </div>
            </FormSection>

            <FormSection title="Contacto">
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
                <TextField
                  path="telefonoFijo"
                  label="Teléfono fijo"
                  type="tel"
                />
                <TextField
                  path="telefonoCelular"
                  label="Teléfono celular"
                  type="tel"
                  help="Debes dar al menos un teléfono."
                />
                <TextField
                  path="email"
                  label="Correo electrónico"
                  type="email"
                />
              </div>
            </FormSection>

            <div className="flex items-center justify-end gap-3 pt-4 border-t border-gray-200 sticky bottom-0 bg-white">
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 text-sm text-gray-700 hover:bg-gray-100 rounded-lg"
                disabled={submitting}
              >
                Cancelar
              </button>
              <button
                type="submit"
                className="inline-flex items-center gap-2 px-5 py-2 rounded-lg bg-inyecta-700 hover:bg-inyecta-800 disabled:bg-inyecta-400 text-white text-sm font-medium"
                disabled={submitting}
              >
                {submitting ? (
                  <>
                    <Loader2 size={14} className="animate-spin" /> Guardando…
                  </>
                ) : (
                  <>Guardar aval</>
                )}
              </button>
            </div>
          </form>
        </FormProvider>
      </div>
    </div>
  );
}
