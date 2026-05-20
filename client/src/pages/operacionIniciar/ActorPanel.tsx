/**
 * ActorPanel — columna izquierda con la lista de involucrados.
 *
 * Muestra:
 *   - Titular (1 o 0)
 *   - Avales (0..N) con botón "+ Aval"
 *   - Stubs disabled de Rep. Legal y Socios (v0.1)
 *
 * El operador selecciona un actor → la columna derecha muestra sus
 * datos consolidados.
 */
import { Trash2, User, Building2, UserCircle2 } from 'lucide-react';
import type { OperationDraftActor, ActorSubtipo } from './types';

interface Props {
  actores: OperationDraftActor[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  onAddTitular: () => void;
  onAddAval: () => void;
  onDelete: (id: string) => void;
}

function subtipoStyle(subtipo: ActorSubtipo): { bg: string; text: string; label: string } {
  switch (subtipo) {
    case 'PFAE': return { bg: 'bg-emerald-100', text: 'text-emerald-700', label: 'PFAE' };
    case 'PM':   return { bg: 'bg-purple-100',  text: 'text-purple-700',  label: 'PM' };
    case 'PF':   return { bg: 'bg-blue-100',    text: 'text-blue-700',    label: 'PF' };
  }
}

function porcentajeCompletitud(actor: OperationDraftActor): number {
  // Heurística simple v0: cuenta cuántos campos clave están poblados.
  // En v0.1 se reemplaza con la checklist real por rol+subtipo.
  const d = actor.datosConsolidados ?? {};
  const camposClave: string[] = actor.subtipo === 'PM'
    ? ['razonSocial', 'rfc', 'fechaConstitucion', 'calle', 'colonia', 'cp']
    : ['nombre', 'apellidoPaterno', 'rfc', 'curp', 'calle', 'cp'];
  const poblados = camposClave.filter((k) => {
    const v = (d as Record<string, unknown>)[k];
    return v !== null && v !== undefined && v !== '';
  }).length;
  return Math.round((poblados / camposClave.length) * 100);
}

function ActorCard({
  actor,
  selected,
  onSelect,
  onDelete,
}: {
  actor: OperationDraftActor;
  selected: boolean;
  onSelect: () => void;
  onDelete: () => void;
}) {
  const subtipo = subtipoStyle(actor.subtipo);
  const pct = porcentajeCompletitud(actor);
  return (
    <div
      onClick={onSelect}
      className={`group relative p-2.5 rounded-lg border cursor-pointer transition-colors mb-1.5 ${
        selected
          ? 'border-orange-400 bg-orange-50'
          : 'border-gray-200 hover:bg-gray-50'
      }`}
    >
      <div className="flex items-center justify-between gap-2">
        <span className="text-sm font-medium text-gray-900 truncate">{actor.nombre}</span>
        <span className={`text-[10px] px-1.5 py-0.5 rounded font-medium shrink-0 ${subtipo.bg} ${subtipo.text}`}>
          {subtipo.label}
        </span>
      </div>
      <div className="flex items-center justify-between mt-0.5">
        <div className="text-xs text-gray-500">
          {actor.documentos.length} doc{actor.documentos.length !== 1 ? 's' : ''} · {pct}% completo
        </div>
        <button
          onClick={(e) => { e.stopPropagation(); onDelete(); }}
          className="opacity-0 group-hover:opacity-100 text-gray-400 hover:text-red-500 transition-opacity"
          title="Quitar este involucrado"
        >
          <Trash2 size={12} />
        </button>
      </div>
    </div>
  );
}

export function ActorPanel({ actores, selectedId, onSelect, onAddTitular, onAddAval, onDelete }: Props) {
  const titular = actores.find((a) => a.rol === 'TITULAR') ?? null;
  const avales = actores.filter((a) => a.rol === 'AVAL').sort((a, b) => a.orden - b.orden);

  return (
    <div className="bg-white rounded-lg border border-gray-200 p-4 h-full overflow-y-auto">
      <h2 className="text-sm font-semibold text-gray-800 mb-3 flex items-center gap-2">
        <UserCircle2 size={16} /> Involucrados
      </h2>

      {/* Titular */}
      <div className="mb-4">
        <div className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-1.5 flex items-center gap-1">
          <User size={11} /> Titular
        </div>
        {titular ? (
          <ActorCard
            actor={titular}
            selected={selectedId === titular.id}
            onSelect={() => onSelect(titular.id)}
            onDelete={() => onDelete(titular.id)}
          />
        ) : (
          <button
            onClick={onAddTitular}
            className="w-full text-left p-2.5 rounded-lg border border-dashed border-inyecta-300 text-xs text-inyecta-700 hover:bg-inyecta-50"
          >
            + Declarar titular
          </button>
        )}
      </div>

      {/* Avales */}
      <div className="mb-4">
        <div className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-1.5 flex items-center justify-between">
          <span className="flex items-center gap-1">
            <Building2 size={11} /> Avales ({avales.length})
          </span>
          <button onClick={onAddAval} className="text-[10px] text-inyecta-700 hover:underline">
            + Aval
          </button>
        </div>
        {avales.length === 0 && (
          <p className="text-xs text-gray-400 italic">Sin avales declarados</p>
        )}
        {avales.map((a) => (
          <ActorCard
            key={a.id}
            actor={a}
            selected={selectedId === a.id}
            onSelect={() => onSelect(a.id)}
            onDelete={() => onDelete(a.id)}
          />
        ))}
      </div>

      {/* Stubs v0.1 */}
      <div className="space-y-2 opacity-60">
        <div>
          <div className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-1.5">
            Rep. Legal <span className="text-[10px] text-gray-400">(v0.1)</span>
          </div>
          <button
            disabled
            className="w-full p-2.5 rounded-lg border border-dashed border-gray-300 text-xs text-gray-400 cursor-not-allowed"
          >
            Disponible en próxima versión
          </button>
        </div>
        <div>
          <div className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-1.5">
            Socios / Accionistas <span className="text-[10px] text-gray-400">(v0.1)</span>
          </div>
          <button
            disabled
            className="w-full p-2.5 rounded-lg border border-dashed border-gray-300 text-xs text-gray-400 cursor-not-allowed"
          >
            Disponible en próxima versión
          </button>
        </div>
      </div>
    </div>
  );
}
