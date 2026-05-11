// Botón de ayuda contextual para el campo "PEP" (Persona Expuesta
// Políticamente). Se monta junto al título de la sección PEP en
// formularios KYC (Step3Kyc del wizard de Nueva Operación y página
// /solicitudes/cargar).
//
// El texto explicativo va orientado a operadores menos familiarizados
// con la regulación PLD/CNBV: define qué es una PEP, qué ley la rige
// (LFPIORPI), y quiénes entran en la categoría (funcionarios, militares,
// directivos de empresas estatales, dirigentes de partidos, diputados,
// y familiares hasta 2do grado + socios cercanos).
//
// Cierra con: clic afuera, tecla Esc, o el botón ✕ del popover.
import { useEffect, useRef, useState } from 'react';
import { Info, X } from 'lucide-react';

export function PepInfoButton() {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!open) return;

    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    const onClick = (e: MouseEvent) => {
      if (
        containerRef.current &&
        !containerRef.current.contains(e.target as Node)
      ) {
        setOpen(false);
      }
    };
    document.addEventListener('keydown', onKey);
    document.addEventListener('mousedown', onClick);
    return () => {
      document.removeEventListener('keydown', onKey);
      document.removeEventListener('mousedown', onClick);
    };
  }, [open]);

  return (
    <div ref={containerRef} className="relative inline-flex">
      <button
        type="button"
        onClick={(e) => {
          // Evitar que clicks en el botón cuenten como "clic afuera" y se
          // cierre inmediatamente. También evita que el click se propague
          // al header colapsable del Card en CargarSolicitud.
          e.stopPropagation();
          setOpen((v) => !v);
        }}
        aria-label="Más información sobre PEP"
        aria-expanded={open}
        className="inline-flex items-center justify-center w-5 h-5 rounded-full text-gray-400 hover:text-inyecta-700 hover:bg-inyecta-50 transition-colors"
      >
        <Info size={14} />
      </button>

      {open && (
        <div
          role="dialog"
          aria-label="Qué es una Persona Expuesta Políticamente"
          onClick={(e) => e.stopPropagation()}
          className="absolute top-7 right-0 z-20 w-[min(28rem,90vw)] bg-white border border-gray-200 rounded-xl shadow-lg p-4 text-xs text-gray-700 normal-case font-normal"
        >
          <div className="flex items-start justify-between mb-2">
            <h4 className="font-semibold text-sm text-gray-900">
              ¿Qué es una PEP?
            </h4>
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                setOpen(false);
              }}
              aria-label="Cerrar"
              className="text-gray-400 hover:text-gray-700"
            >
              <X size={14} />
            </button>
          </div>

          <p className="mb-2 leading-relaxed">
            Es un concepto regulatorio del PLD (Prevención de Lavado de
            Dinero) que las SOFOMs deben checar en cada cliente. La ley que
            lo exige es la <strong>LFPIORPI</strong> (Ley Federal para la
            Prevención e Identificación de Operaciones con Recursos de
            Procedencia Ilícita) + reglas de la <strong>CNBV / UIF</strong>.
          </p>

          <p className="font-semibold text-gray-900 mt-3 mb-1">Quién es PEP:</p>
          <ul className="list-disc pl-5 space-y-1 leading-relaxed">
            <li>
              Funcionarios públicos de alto nivel (federales, estatales,
              municipales): secretarios, subsecretarios, directores
              generales, gobernadores, presidentes municipales, magistrados,
              jueces federales.
            </li>
            <li>Militares y mandos de seguridad de alto rango.</li>
            <li>Directivos de empresas estatales (Pemex, CFE, etc.).</li>
            <li>Dirigentes de partidos políticos.</li>
            <li>Diputados, senadores.</li>
            <li>
              <strong>Familiares hasta 2do grado</strong> (cónyuge, padres,
              hijos, hermanos, suegros) y <strong>socios o asociados
              cercanos</strong> de cualquiera de los anteriores.
            </li>
            <li>
              Aplica durante el cargo y hasta 1 año después de dejarlo
              (algunos criterios dicen 2 años).
            </li>
          </ul>
        </div>
      )}
    </div>
  );
}
