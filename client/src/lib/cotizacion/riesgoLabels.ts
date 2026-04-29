/**
 * Mapeo entre el enum de BD (`RiskLevel`: A/B/C) y los labels humanos
 * en español (Bajo/Medio/Alto).
 *
 * Renombre cosmético — las claves en BD se quedan como A/B/C para no
 * romper compat con cotizaciones y contratos antiguos. Esta función
 * es la única fuente de verdad para los labels que se muestran en
 * cotizador, listados, PDFs y portal.
 *
 * Decisión 27-04-2026 (Damián): "cambia los títulos pero no toques
 * cotizaciones antiguas".
 */

export type NivelKey = 'A' | 'B' | 'C';

const LABELS: Record<NivelKey, string> = {
  A: 'Bajo',
  B: 'Medio',
  C: 'Alto',
};

/** Devuelve el nombre humano del nivel ('Bajo', 'Medio', 'Alto'). */
export function riskLabel(nivel: NivelKey | string | null | undefined): string {
  if (!nivel) return '—';
  if (nivel === 'A' || nivel === 'B' || nivel === 'C') return LABELS[nivel];
  // Defensivo: si por alguna razón llega un nivel desconocido (ej. una
  // migración futura agrega 'D'), devolvemos la clave tal cual en
  // lugar de crashear el componente.
  return String(nivel);
}

/** Color tailwind para badges del nivel. */
export function riskBadgeClasses(nivel: NivelKey | string | null | undefined): string {
  if (nivel === 'A') return 'bg-emerald-100 text-emerald-700';
  if (nivel === 'B') return 'bg-amber-100 text-amber-700';
  if (nivel === 'C') return 'bg-red-100 text-red-700';
  return 'bg-gray-100 text-gray-600';
}

/** Lista en orden estándar (Bajo → Medio → Alto) para selectores. */
export const NIVELES_ORDENADOS: { key: NivelKey; label: string }[] = [
  { key: 'A', label: 'Bajo' },
  { key: 'B', label: 'Medio' },
  { key: 'C', label: 'Alto' },
];
