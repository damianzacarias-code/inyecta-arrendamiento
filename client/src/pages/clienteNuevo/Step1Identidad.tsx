// Paso 1 — Tipo de arrendatario (PFAE/PM) + datos de identidad.
//
// La selección de tipo habilita/deshabilita bloques enteros:
//   - PFAE: nombre + apellidos + CURP
//   - PM  : razón social + datos corporativos (constitución, RPC, capital)
//
// RFC, email, teléfono, identidad fiscal y metadata son compartidos.

import { useFormContext } from 'react-hook-form';
import { Building2, User } from 'lucide-react';
import { clsx } from 'clsx';
import { FormSection, TextField } from '@/components/wizard/fields';

export function Step1Identidad() {
  const { watch, setValue } = useFormContext();
  const tipo = watch('tipo') as 'PFAE' | 'PM';

  return (
    <>
      <FormSection
        title="Tipo de arrendatario"
        description="Define qué campos de identidad pedirá el sistema."
      >
        <div className="flex flex-col sm:flex-row gap-3">
          <button
            type="button"
            onClick={() => setValue('tipo', 'PM', { shouldDirty: true })}
            className={clsx(
              'flex-1 flex items-center gap-3 p-4 rounded-xl border-2 text-left transition-colors',
              tipo === 'PM'
                ? 'border-inyecta-600 bg-inyecta-50'
                : 'border-gray-200 hover:border-gray-300',
            )}
          >
            <Building2
              size={24}
              className={tipo === 'PM' ? 'text-inyecta-600' : 'text-gray-400'}
            />
            <div>
              <div className="font-medium text-gray-900">Persona Moral (PM)</div>
              <div className="text-xs text-gray-500">
                S.A., S. de R.L., S.P.R., etc.
              </div>
            </div>
          </button>
          <button
            type="button"
            onClick={() => setValue('tipo', 'PFAE', { shouldDirty: true })}
            className={clsx(
              'flex-1 flex items-center gap-3 p-4 rounded-xl border-2 text-left transition-colors',
              tipo === 'PFAE'
                ? 'border-inyecta-600 bg-inyecta-50'
                : 'border-gray-200 hover:border-gray-300',
            )}
          >
            <User
              size={24}
              className={tipo === 'PFAE' ? 'text-inyecta-600' : 'text-gray-400'}
            />
            <div>
              <div className="font-medium text-gray-900">
                Persona Física (PFAE)
              </div>
              <div className="text-xs text-gray-500">
                Persona física con actividad empresarial
              </div>
            </div>
          </button>
        </div>
      </FormSection>

      {tipo === 'PM' ? (
        <FormSection
          title="Datos de la persona moral"
          description="Información extraída del acta constitutiva y del RPC."
        >
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <TextField
              path="razonSocial"
              label="Razón social"
              required
              uppercase
              className="lg:col-span-2"
            />
            <TextField
              path="fechaConstitucion"
              label="Fecha de constitución"
              type="date"
              required
            />
            <TextField
              path="capitalSocial"
              label="Capital social"
              type="number"
              required
              placeholder="0.00"
              help="Monto en MXN, puede incluir centavos."
            />
            <TextField
              path="folioMercantil"
              label="Folio mercantil electrónico (FME)"
              required
              uppercase
              help="Folio único del Registro Público de Comercio."
            />
            <TextField
              path="fechaInscripcionRPC"
              label="Fecha de inscripción en RPC"
              type="date"
            />
            <TextField
              path="actaConstitutiva"
              label="Instrumento del acta constitutiva"
              placeholder="Escritura 12,345 ante notario público 7"
              className="lg:col-span-2"
            />
            <TextField
              path="registroPublico"
              label="Registro Público de Comercio"
              placeholder="RPC de la entidad donde se inscribió"
              className="lg:col-span-2"
            />
          </div>
        </FormSection>
      ) : (
        <FormSection
          title="Datos de la persona física"
          description="El CURP es obligatorio por requerimiento KYC (CNBV)."
        >
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <TextField path="nombre" label="Nombre(s)" required uppercase />
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
            <TextField
              path="curp"
              label="CURP"
              required
              uppercase
              maxLength={18}
              monospace
              placeholder="XXXX000000XXXXXX00"
            />
          </div>
        </FormSection>
      )}

      <FormSection
        title="Identidad fiscal y contacto"
        description="RFC obligatorio para persona física y moral."
      >
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <TextField
            path="rfc"
            label="RFC"
            required
            uppercase
            monospace
            maxLength={13}
            placeholder={tipo === 'PM' ? 'ABC123456XY0' : 'GARC850101AB1'}
          />
          <TextField path="regimenFiscal" label="Régimen fiscal" />
          <TextField
            path="fiel"
            label="FIEL / e.firma"
            help="Número de serie del certificado digital."
          />
          <TextField
            path="anosAntiguedadActividad"
            label="Años de antigüedad en la actividad"
            type="number"
          />
          <TextField path="email" label="Correo electrónico" type="email" />
          <TextField path="telefono" label="Teléfono" type="tel" />
          <TextField
            path="telefonoOficina"
            label="Teléfono de oficina"
            type="tel"
          />
          <TextField
            path="registroIMSS"
            label="Registro patronal IMSS"
            help="Si aplica (opcional)."
          />
        </div>
      </FormSection>

      <FormSection
        title="Actividad económica"
        description="Giro que describe mejor la operación del cliente."
      >
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <TextField
            path="sector"
            label="Sector"
            placeholder="Transporte, Construcción, Servicios..."
          />
          <TextField
            path="actividadEconomica"
            label="Actividad económica específica"
            placeholder="Ej: Arrendamiento de maquinaria pesada"
          />
        </div>
      </FormSection>
    </>
  );
}
