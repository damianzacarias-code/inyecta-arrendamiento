/**
 * Catalog singleton — tasas, comisiones, GPS y presets de riesgo del
 * cotizador. Espejo del patrón de `branding.ts`.
 *
 * Se carga una vez en App.tsx (después del login) y queda cacheado en
 * memoria para que el cotizador y el visor de opciones lo usen sin
 * await. Si la fetch falla, los defaults históricos hardcoded
 * mantienen el sistema operativo (mismos valores que el seed de la
 * migración, así que no hay drift).
 */
import { useEffect, useState } from 'react';
import api from './api';

export interface CatalogConfig {
  clave: string;
  tasaAnualDefault: number;
  tasaAnualMin: number;
  tasaAnualMax: number;
  comisionAperturaDefault: number;
  comisionAperturaMin: number;
  comisionAperturaMax: number;
  gpsMontoDefault: number;
  gpsFinanciableDefault: boolean;
  tasaMoratoriaMultiplier: number;
  updatedAt?: string;
  updatedById?: string | null;
}

export interface RiskPreset {
  nivel: string;        // 'A' | 'B' | 'C'
  nombre: string;
  engachePuroPct: number;
  depositoPuroPct: number;
  engancheFinPct: number;
  depositoFinPct: number;
  orden: number;
  updatedAt?: string;
  updatedById?: string | null;
}

export interface CatalogPayload {
  catalog: CatalogConfig;
  riskPresets: RiskPreset[];
}

const DEFAULT_CATALOG: CatalogConfig = {
  clave: 'default',
  tasaAnualDefault: 0.36,
  tasaAnualMin: 0.18,
  tasaAnualMax: 0.60,
  comisionAperturaDefault: 0.05,
  comisionAperturaMin: 0,
  comisionAperturaMax: 0.10,
  gpsMontoDefault: 16000,
  gpsFinanciableDefault: true,
  tasaMoratoriaMultiplier: 2,
};

const DEFAULT_RISK_PRESETS: RiskPreset[] = [
  { nivel: 'A', nombre: 'Riesgo bajo',  engachePuroPct: 0, depositoPuroPct: 0.16, engancheFinPct: 0,    depositoFinPct: 0.16, orden: 1 },
  { nivel: 'B', nombre: 'Riesgo medio', engachePuroPct: 0, depositoPuroPct: 0.21, engancheFinPct: 0.05, depositoFinPct: 0.16, orden: 2 },
  { nivel: 'C', nombre: 'Riesgo alto',  engachePuroPct: 0, depositoPuroPct: 0.26, engancheFinPct: 0.10, depositoFinPct: 0.16, orden: 3 },
];

let cache: CatalogPayload = { catalog: DEFAULT_CATALOG, riskPresets: DEFAULT_RISK_PRESETS };
let inflight: Promise<CatalogPayload> | null = null;
let loaded = false;
const subscribers = new Set<() => void>();

function notify() {
  for (const fn of subscribers) {
    try {
      fn();
    } catch {
      /* aislado */
    }
  }
}

/** Devuelve el catálogo de manera síncrona (default si la fetch no terminó). */
export function getCatalog(): CatalogPayload {
  return cache;
}

/**
 * Carga el catálogo desde el backend. Idempotente; concurrentes comparten
 * la misma promesa en vuelo. Si falla, conserva el último valor válido.
 */
export async function loadCatalog(): Promise<CatalogPayload> {
  if (inflight) return inflight;
  inflight = api
    .get<CatalogPayload>('/config/catalog')
    .then((res) => {
      cache = res.data;
      loaded = true;
      notify();
      return cache;
    })
    .catch((err) => {
      // eslint-disable-next-line no-console
      console.warn('[catalog] no se pudo cargar /api/config/catalog:', err);
      return cache;
    })
    .finally(() => {
      inflight = null;
    });
  return inflight;
}

/** Forzar recarga (útil tras editar en /admin/catalogo). */
export async function reloadCatalog(): Promise<CatalogPayload> {
  inflight = null;
  loaded = false;
  return loadCatalog();
}

/** Hook React: re-renderiza cuando llegue el dato fresco. */
export function useCatalog(): CatalogPayload {
  const [, setTick] = useState(0);
  useEffect(() => {
    if (!loaded && !inflight) {
      void loadCatalog();
    }
    const fn = () => setTick((n) => n + 1);
    subscribers.add(fn);
    return () => {
      subscribers.delete(fn);
    };
  }, []);
  return cache;
}
