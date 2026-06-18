// Nuevo / Editar Arrendatario — página.
//
// Tras la Fase 1 del rediseño de operaciones, el formulario en sí vive
// en el componente reutilizable `ClienteWizardForm` (pages/clienteNuevo/),
// que también se monta dentro del wizard de operación. Esta página solo
// aporta el chrome (título + volver) y conecta el guardado a la
// navegación. El modo edición se activa con el :id de la ruta.

import { useNavigate, useParams, Link } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import { ClienteWizardForm } from './clienteNuevo/ClienteWizardForm';

export default function ClienteNuevo() {
  const navigate = useNavigate();
  const { id: editId } = useParams<{ id: string }>();
  const isEditing = !!editId;

  const backHref = isEditing && editId ? `/clientes/${editId}` : '/clientes';
  const titulo = isEditing ? 'Editar Arrendatario' : 'Nuevo Arrendatario';
  const descripcion = isEditing
    ? 'Actualiza los datos del arrendatario (CNBV / KYC)'
    : 'Solicitud completa de arrendamiento (CNBV / KYC)';

  return (
    <div>
      <div className="flex items-center gap-3 mb-6 max-w-4xl mx-auto">
        <Link to={backHref} className="text-gray-400 hover:text-gray-600">
          <ArrowLeft size={20} />
        </Link>
        <div>
          <h1 className="text-2xl font-bold text-gray-900">{titulo}</h1>
          <p className="text-gray-500 text-sm">{descripcion}</p>
        </div>
      </div>

      <ClienteWizardForm
        editId={editId}
        onSaved={(cliente) => navigate(`/clientes/${cliente.id}`)}
        onCancel={() => navigate(backHref)}
      />
    </div>
  );
}
