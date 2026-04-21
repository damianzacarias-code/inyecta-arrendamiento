// Wizard shell — stepper + contenedor + botones de navegación.
// Agnóstico del contenido de cada paso; solo renderiza children y
// gestiona el chrome (header, indicador, botones).

import { type ReactNode } from 'react';
import { ArrowLeft, ArrowRight, Check, Save, Loader2 } from 'lucide-react';
import { clsx } from 'clsx';

export interface WizardStep {
  key: string;
  title: string;
  description: string;
  /** Si es false el paso se oculta del indicador (p. ej. accionistas en PFAE). */
  visible?: boolean;
}

interface WizardShellProps {
  steps: WizardStep[];
  /** Índice (0-based) del paso visible actual (después de filtrar invisibles). */
  currentIndex: number;
  children: ReactNode;
  onBack: () => void;
  onNext: () => void;
  onSubmit: () => void;
  isSubmitting?: boolean;
  submitLabel?: string;
  /** Si true desactiva el botón de avanzar (p. ej. mientras valida). */
  nextDisabled?: boolean;
  /** Error general (no asociado a un campo). */
  formError?: string;
}

export function WizardShell({
  steps,
  currentIndex,
  children,
  onBack,
  onNext,
  onSubmit,
  isSubmitting,
  submitLabel = 'Registrar arrendatario',
  nextDisabled,
  formError,
}: WizardShellProps) {
  const visibleSteps = steps.filter((s) => s.visible !== false);
  const isFirst = currentIndex === 0;
  const isLast = currentIndex === visibleSteps.length - 1;

  return (
    <div className="max-w-4xl mx-auto">
      {/* Stepper */}
      <div className="bg-white rounded-xl border border-gray-200 p-6 mb-6">
        <ol className="flex items-start justify-between gap-2">
          {visibleSteps.map((step, idx) => {
            const isCurrent = idx === currentIndex;
            const isCompleted = idx < currentIndex;
            return (
              <li
                key={step.key}
                className="flex-1 flex flex-col items-center text-center relative"
              >
                {/* Línea conectora (excepto en el último) */}
                {idx < visibleSteps.length - 1 && (
                  <div
                    className={clsx(
                      'absolute top-4 left-1/2 w-full h-0.5 -z-0',
                      isCompleted ? 'bg-inyecta-500' : 'bg-gray-200',
                    )}
                    style={{ transform: 'translateX(50%)' }}
                  />
                )}
                <div
                  className={clsx(
                    'relative z-10 w-8 h-8 rounded-full flex items-center justify-center text-xs font-semibold border-2 transition-colors',
                    isCompleted && 'bg-inyecta-500 border-inyecta-500 text-white',
                    isCurrent && !isCompleted && 'bg-white border-inyecta-500 text-inyecta-600',
                    !isCompleted && !isCurrent && 'bg-white border-gray-300 text-gray-400',
                  )}
                >
                  {isCompleted ? <Check size={14} /> : idx + 1}
                </div>
                <div className="mt-2 px-1">
                  <div
                    className={clsx(
                      'text-xs font-medium',
                      isCurrent || isCompleted ? 'text-gray-900' : 'text-gray-400',
                    )}
                  >
                    {step.title}
                  </div>
                  <div className="text-[11px] text-gray-400 hidden sm:block">
                    {step.description}
                  </div>
                </div>
              </li>
            );
          })}
        </ol>
      </div>

      {/* Error general */}
      {formError && (
        <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg text-sm mb-4">
          {formError}
        </div>
      )}

      {/* Contenido del paso */}
      <div className="space-y-6">{children}</div>

      {/* Footer de navegación */}
      <div className="mt-6 flex items-center justify-between bg-white rounded-xl border border-gray-200 p-4">
        <button
          type="button"
          onClick={onBack}
          disabled={isFirst || isSubmitting}
          className={clsx(
            'inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors',
            isFirst || isSubmitting
              ? 'text-gray-300 cursor-not-allowed'
              : 'text-gray-700 hover:bg-gray-100',
          )}
        >
          <ArrowLeft size={16} /> Atrás
        </button>

        <div className="text-xs text-gray-400">
          Paso {currentIndex + 1} de {visibleSteps.length}
        </div>

        {isLast ? (
          <button
            type="button"
            onClick={onSubmit}
            disabled={isSubmitting}
            className="inline-flex items-center gap-2 px-5 py-2 rounded-lg bg-inyecta-700 hover:bg-inyecta-800 disabled:bg-inyecta-400 text-white text-sm font-medium transition-colors"
          >
            {isSubmitting ? (
              <>
                <Loader2 size={16} className="animate-spin" /> Guardando…
              </>
            ) : (
              <>
                <Save size={16} /> {submitLabel}
              </>
            )}
          </button>
        ) : (
          <button
            type="button"
            onClick={onNext}
            disabled={nextDisabled || isSubmitting}
            className="inline-flex items-center gap-2 px-5 py-2 rounded-lg bg-inyecta-700 hover:bg-inyecta-800 disabled:bg-inyecta-400 text-white text-sm font-medium transition-colors"
          >
            Siguiente <ArrowRight size={16} />
          </button>
        )}
      </div>
    </div>
  );
}
