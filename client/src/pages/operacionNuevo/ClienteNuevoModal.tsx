// Modal para dar de alta un arrendatario SIN salir del wizard de
// operación (Fase 1 del rediseño: "el cliente se crea dentro de la
// operación"). Reusa el formulario completo de ClienteWizardForm; al
// crear con éxito, llama onCreated(cliente) para que el paso 1 lo
// auto-seleccione, y cierra.

import { X } from 'lucide-react';
import {
  ClienteWizardForm,
  type SavedClient,
} from '../clienteNuevo/ClienteWizardForm';

interface Props {
  onClose: () => void;
  onCreated: (cliente: SavedClient) => void;
}

export function ClienteNuevoModal({ onClose, onCreated }: Props) {
  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-start justify-center overflow-y-auto py-10 px-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-4xl">
        <div className="flex items-center justify-between p-5 border-b border-gray-200 sticky top-0 bg-white rounded-t-2xl z-10">
          <div>
            <h3 className="font-semibold text-gray-900">Nuevo arrendatario</h3>
            <p className="text-xs text-gray-500">
              El cliente queda registrado y se selecciona automáticamente en
              esta operación.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600"
            aria-label="Cerrar"
          >
            <X size={20} />
          </button>
        </div>

        <div className="p-5">
          <ClienteWizardForm
            onSaved={(cliente) => {
              onCreated(cliente);
              onClose();
            }}
            onCancel={onClose}
          />
        </div>
      </div>
    </div>
  );
}
