/**
 * LoadErrorState — UI estandarizada para errores de carga de datos
 * de una página o sección.
 *
 * Antes de este componente, varias páginas (Contratos, Clientes,
 * Cotizaciones, Cobranza, etc.) silenciaban errores de fetch con
 * `.catch(() => {})`. Si la API caía, el usuario veía la página
 * vacía sin saber por qué — pensaba que no tenía datos cuando en
 * realidad había una falla. Este componente unifica el manejo:
 *
 *   if (loadError) return <LoadErrorState error={loadError} onRetry={fetch} />
 *
 * Diseño: card centrada con ícono, mensaje legible, detalle de la
 * causa y un botón "Reintentar". Mantiene el padding del layout
 * para no romper el flujo visual del resto de la página.
 */
import { AlertTriangle, RefreshCw } from 'lucide-react';

interface Props {
  /** Mensaje principal a mostrar al usuario (ya legible, no exception cruda). */
  error: string;
  /** Callback al hacer click en "Reintentar". Si se omite, oculta el botón. */
  onRetry?: () => void;
  /** Texto opcional encima del mensaje (ej: "No se pudo cargar la lista de contratos"). */
  title?: string;
}

export default function LoadErrorState({ error, onRetry, title }: Props) {
  return (
    <div className="flex items-center justify-center py-16 px-4">
      <div className="max-w-md w-full bg-white border border-red-200 rounded-xl p-6 text-center">
        <div className="inline-flex items-center justify-center w-12 h-12 rounded-full bg-red-50 mb-3">
          <AlertTriangle className="text-red-600" size={24} />
        </div>
        <h3 className="text-base font-semibold text-gray-900 mb-1">
          {title ?? 'No se pudieron cargar los datos'}
        </h3>
        <p className="text-sm text-gray-600 mb-4">{error}</p>
        {onRetry && (
          <button
            type="button"
            onClick={onRetry}
            className="inline-flex items-center gap-2 px-4 py-2 bg-inyecta-700 text-white rounded-lg text-sm font-medium hover:bg-inyecta-800 transition-colors"
          >
            <RefreshCw size={14} /> Reintentar
          </button>
        )}
      </div>
    </div>
  );
}

/**
 * Helper para extraer un mensaje legible de un error de axios o desconocido.
 * Mismo patrón que ya usan otras páginas (ClienteDetalle.tsx) para evitar
 * mostrar "[object Object]" o stacks crudos al usuario.
 */
export function describeApiError(err: unknown): string {
  const anyErr = err as {
    response?: { status?: number; data?: { error?: string | { message?: string } } };
    message?: string;
  };
  const status = anyErr.response?.status;
  const data = anyErr.response?.data;
  let detail: string | undefined;
  if (typeof data?.error === 'string') detail = data.error;
  else if (typeof data?.error === 'object' && data.error?.message) detail = data.error.message;

  if (status === 401 || status === 403) return 'No tienes permisos para ver esta información.';
  if (status === 404) return 'El recurso no existe o fue eliminado.';
  if (status && status >= 500) return `Error del servidor (${status})${detail ? `: ${detail}` : '.'}`;
  if (detail) return detail;
  if (anyErr.message) return anyErr.message;
  return 'Error desconocido al contactar el servidor.';
}
