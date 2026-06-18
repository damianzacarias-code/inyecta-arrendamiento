/**
 * ErrorBoundary — red de seguridad para errores de render.
 *
 * Antes de esto, cualquier excepción no atrapada durante el render de
 * una página tumbaba TODO el árbol de React → pantalla blanca sin
 * explicación (caso real: /cotizaciones/:id con "Buffer is not
 * defined" de @react-pdf en producción).
 *
 * Ahora, un error de render se atrapa aquí y se muestra un mensaje
 * accionable, conservando la barra lateral del Layout. El boundary se
 * resetea automáticamente al navegar a otra ruta (la prop `resetKey`
 * cambia con el pathname y fuerza re-montaje).
 */
import { Component, type ReactNode, type ErrorInfo } from 'react';
import { AlertTriangle } from 'lucide-react';

interface Props {
  children: ReactNode;
  /** Cambiar este valor (ej. el pathname) re-monta el boundary y limpia el error. */
  resetKey?: string;
}

interface State {
  error: Error | null;
}

export default class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    // Visible en la consola del navegador para diagnóstico.
    console.error('ErrorBoundary atrapó un error de render:', error, info);
  }

  componentDidUpdate(prev: Props): void {
    // Al cambiar de ruta, limpiamos el error para no quedar "pegados".
    if (prev.resetKey !== this.props.resetKey && this.state.error) {
      this.setState({ error: null });
    }
  }

  render(): ReactNode {
    const { error } = this.state;
    if (!error) return this.props.children;

    return (
      <div className="max-w-xl mx-auto py-16 text-center">
        <AlertTriangle size={40} className="mx-auto text-amber-500 mb-4" />
        <h1 className="text-lg font-semibold text-gray-900 mb-2">
          Algo salió mal al mostrar esta pantalla
        </h1>
        <p className="text-sm text-gray-600 mb-1">
          La información se guardó correctamente; el problema es solo al desplegarla.
        </p>
        <p className="text-xs text-gray-400 mb-6 font-mono break-words">
          {error.message}
        </p>
        <div className="flex items-center justify-center gap-3">
          <button
            onClick={() => this.setState({ error: null })}
            className="px-4 py-2 text-sm rounded-lg bg-inyecta-700 text-white hover:bg-inyecta-800"
          >
            Reintentar
          </button>
          <button
            onClick={() => window.history.back()}
            className="px-4 py-2 text-sm rounded-lg border border-gray-300 text-gray-700 hover:bg-gray-50"
          >
            Volver
          </button>
        </div>
      </div>
    );
  }
}
