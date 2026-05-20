/**
 * ActorDataPanel — columna derecha. Datos consolidados del actor
 * seleccionado, editables in-place.
 *
 * Cada cambio se guarda con debounce (300ms) → PATCH al backend.
 * Los docs vinculados aparecen al final como referencia.
 */
import { useEffect, useRef, useState } from 'react';
import { FileText } from 'lucide-react';
import type { OperationDraftActor, ActorDatosConsolidados } from './types';

interface Props {
  actor: OperationDraftActor | null;
  onSave: (datos: ActorDatosConsolidados) => Promise<void>;
}

/**
 * Secciones de campos por subtipo. PFAE y PM tienen overlap pero
 * separadas en grupos para la UI sea legible.
 */
const SECCIONES: Record<string, { titulo: string; campos: { key: keyof ActorDatosConsolidados; label: string; type?: 'text' | 'number' }[] }[]> = {
  PFAE: [
    {
      titulo: 'Identidad personal',
      campos: [
        { key: 'nombre', label: 'Nombre' },
        { key: 'apellidoPaterno', label: 'Apellido paterno' },
        { key: 'apellidoMaterno', label: 'Apellido materno' },
        { key: 'curp', label: 'CURP' },
        { key: 'fechaNacimiento', label: 'Fecha nacimiento' },
        { key: 'sexo', label: 'Sexo' },
        { key: 'nacionalidad', label: 'Nacionalidad' },
        { key: 'lugarNacimiento', label: 'Lugar nacimiento' },
      ],
    },
    {
      titulo: 'Identidad fiscal',
      campos: [
        { key: 'rfc', label: 'RFC' },
        { key: 'regimenFiscal', label: 'Régimen fiscal' },
        { key: 'fiel', label: 'FIEL' },
      ],
    },
    {
      titulo: 'Domicilio',
      campos: [
        { key: 'calle', label: 'Calle' },
        { key: 'numExterior', label: 'Núm. exterior' },
        { key: 'numInterior', label: 'Núm. interior' },
        { key: 'colonia', label: 'Colonia' },
        { key: 'municipio', label: 'Municipio' },
        { key: 'ciudad', label: 'Ciudad' },
        { key: 'estado', label: 'Estado' },
        { key: 'codigoPostal', label: 'Código postal' },
      ],
    },
    {
      titulo: 'Contacto',
      campos: [
        { key: 'email', label: 'Email' },
        { key: 'telefono', label: 'Teléfono' },
        { key: 'celular', label: 'Celular' },
      ],
    },
    {
      titulo: 'Estado civil',
      campos: [
        { key: 'estadoCivil', label: 'Estado civil' },
        { key: 'regimenMatrimonial', label: 'Régimen matrimonial' },
        { key: 'nombreConyuge', label: 'Nombre del cónyuge' },
      ],
    },
    {
      titulo: 'Información financiera',
      campos: [
        { key: 'ocupacion', label: 'Ocupación' },
        { key: 'ingresoMensual', label: 'Ingreso mensual', type: 'number' },
      ],
    },
  ],
  PM: [
    {
      titulo: 'Identidad corporativa',
      campos: [
        { key: 'razonSocial', label: 'Razón social' },
        { key: 'rfc', label: 'RFC' },
        { key: 'regimenFiscal', label: 'Régimen fiscal' },
        { key: 'fiel', label: 'FIEL' },
        { key: 'fechaConstitucion', label: 'Fecha constitución' },
        { key: 'capitalSocial', label: 'Capital social', type: 'number' },
        { key: 'folioMercantil', label: 'Folio mercantil' },
      ],
    },
    {
      titulo: 'Domicilio fiscal',
      campos: [
        { key: 'calle', label: 'Calle' },
        { key: 'numExterior', label: 'Núm. exterior' },
        { key: 'numInterior', label: 'Núm. interior' },
        { key: 'colonia', label: 'Colonia' },
        { key: 'municipio', label: 'Municipio' },
        { key: 'ciudad', label: 'Ciudad' },
        { key: 'estado', label: 'Estado' },
        { key: 'codigoPostal', label: 'Código postal' },
      ],
    },
    {
      titulo: 'Contacto',
      campos: [
        { key: 'email', label: 'Email' },
        { key: 'telefono', label: 'Teléfono' },
      ],
    },
  ],
  PF: [
    {
      titulo: 'Identidad personal',
      campos: [
        { key: 'nombre', label: 'Nombre' },
        { key: 'apellidoPaterno', label: 'Apellido paterno' },
        { key: 'apellidoMaterno', label: 'Apellido materno' },
        { key: 'rfc', label: 'RFC' },
        { key: 'curp', label: 'CURP' },
        { key: 'fechaNacimiento', label: 'Fecha nacimiento' },
        { key: 'sexo', label: 'Sexo' },
      ],
    },
    {
      titulo: 'Domicilio',
      campos: [
        { key: 'calle', label: 'Calle' },
        { key: 'numExterior', label: 'Núm. exterior' },
        { key: 'colonia', label: 'Colonia' },
        { key: 'municipio', label: 'Municipio' },
        { key: 'estado', label: 'Estado' },
        { key: 'codigoPostal', label: 'Código postal' },
      ],
    },
    {
      titulo: 'Contacto',
      campos: [
        { key: 'email', label: 'Email' },
        { key: 'telefono', label: 'Teléfono' },
      ],
    },
    {
      titulo: 'Estado civil',
      campos: [
        { key: 'estadoCivil', label: 'Estado civil' },
        { key: 'regimenMatrimonial', label: 'Régimen matrimonial' },
        { key: 'nombreConyuge', label: 'Cónyuge' },
      ],
    },
  ],
};

export function ActorDataPanel({ actor, onSave }: Props) {
  // Estado local que refleja los datos consolidados del actor + edits
  // pendientes (debounced antes de mandar al server).
  const [localDatos, setLocalDatos] = useState<ActorDatosConsolidados>({});
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastActorId = useRef<string | null>(null);

  // Sincronizar con el actor cuando cambia. Si llegamos a un actor
  // distinto, descartamos cualquier debounce pendiente del anterior.
  useEffect(() => {
    if (actor?.id !== lastActorId.current) {
      if (debounceRef.current) {
        clearTimeout(debounceRef.current);
        debounceRef.current = null;
      }
      lastActorId.current = actor?.id ?? null;
    }
    setLocalDatos(actor?.datosConsolidados ?? {});
  }, [actor]);

  const handleChange = (key: keyof ActorDatosConsolidados, value: string) => {
    const newDatos = { ...localDatos, [key]: value === '' ? null : value };
    setLocalDatos(newDatos);

    // Debounce 400ms
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      void onSave(newDatos);
    }, 400);
  };

  if (!actor) {
    return (
      <div className="bg-white rounded-lg border border-gray-200 p-6 h-full flex items-center justify-center text-center">
        <div>
          <FileText size={28} className="mx-auto text-gray-300 mb-2" />
          <p className="text-sm text-gray-500">Selecciona un involucrado de la izquierda</p>
          <p className="text-xs text-gray-400 mt-1">para ver y editar sus datos consolidados.</p>
        </div>
      </div>
    );
  }

  const secciones = SECCIONES[actor.subtipo] ?? SECCIONES.PF;

  return (
    <div className="bg-white rounded-lg border border-gray-200 p-4 h-full overflow-y-auto">
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-sm font-semibold text-gray-800">Datos consolidados</h2>
        <span className="text-xs px-2 py-0.5 rounded bg-orange-50 text-orange-700 font-medium">
          {actor.nombre}
        </span>
      </div>

      {secciones.map((seccion) => (
        <div key={seccion.titulo} className="mb-4">
          <div className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-2">
            {seccion.titulo}
          </div>
          <div className="space-y-1.5">
            {seccion.campos.map((c) => {
              const raw = localDatos[c.key];
              const valStr = raw === null || raw === undefined ? '' : String(raw);
              return (
                <div key={c.key as string} className="flex items-center justify-between gap-2">
                  <label className="text-xs text-gray-500 shrink-0 w-32">{c.label}</label>
                  <input
                    type={c.type === 'number' ? 'number' : 'text'}
                    value={valStr}
                    onChange={(e) => handleChange(c.key, e.target.value)}
                    placeholder="—"
                    className="flex-1 text-sm text-gray-900 px-2 py-1 border border-transparent hover:border-gray-200 focus:border-inyecta-300 focus:bg-gray-50 rounded outline-none text-right"
                  />
                </div>
              );
            })}
          </div>
        </div>
      ))}

      {/* Docs vinculados */}
      <div className="mt-4 pt-3 border-t border-gray-100">
        <div className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-2">
          Documentos vinculados ({actor.documentos.length})
        </div>
        {actor.documentos.length === 0 ? (
          <p className="text-xs text-gray-400 italic">Aún no hay documentos asignados a este actor.</p>
        ) : (
          <div className="space-y-1">
            {actor.documentos.map((d) => (
              <div key={d.id} className="flex items-center gap-2 p-1.5 rounded hover:bg-gray-50">
                <FileText size={12} className="text-gray-400 shrink-0" />
                <span className="text-xs flex-1 truncate">{d.nombreArchivo}</span>
                <span className="text-[10px] px-1.5 py-0.5 rounded bg-gray-100 text-gray-600 shrink-0">
                  {d.tipoDocumento}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
