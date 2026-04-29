/**
 * Catálogo de proveedores GPS — singleton.
 *
 * Reglas (Damián 28-04-2026):
 *   • Bienes < $500,000 → default GBR
 *   • Bienes ≥ $500,000 → default Tecno Logistic
 *   • "Sin GPS" siempre disponible (con advertencia visual cuando se elige)
 *   • Plazos no en la tabla (12, 18, 30, 42) → siguiente plazo mayor de la
 *     tabla (24/36/48). Implementado en `precioGpsPorPlazo`.
 *   • La descripción del paquete sólo se muestra en UI del sistema, NO en
 *     el PDF de cotización (decisión expresa del operador).
 *
 * Patrón: idéntico al de `branding.ts` y `catalog.ts` — el cotizador
 * llama `getGpsProveedores()` síncrono, los defaults hardcoded de abajo
 * mantienen el sistema funcional si la fetch al server aún no respondió.
 */
import { useEffect, useState } from 'react';
import api from '../api';

export interface GpsProveedor {
  clave: string;                    // 'GBR' | 'TECNO_LOGISTIC' | ...
  nombre: string;
  descripcion?: string | null;
  precio24m: number;
  precio36m: number;
  precio48m: number;
  orden: number;
  activo: boolean;
}

export interface GpsProveedoresPayload {
  proveedores: GpsProveedor[];
}

/** Defaults hardcoded — espejan el seed de la migración. Se usan solo
 *  como fallback cuando la fetch al server aún no terminó (primer
 *  render del cotizador). Cualquier edición admin las desplaza. */
const DEFAULT_PROVEEDORES: GpsProveedor[] = [
  { clave: 'GBR',            nombre: 'GBR',            descripcion: 'GPS sencillo',                       precio24m:  6380, precio36m:  7820, precio48m:  9260, orden: 1, activo: true },
  { clave: 'TECNO_LOGISTIC', nombre: 'Tecno Logistic', descripcion: 'GPS + tracker de mantenimiento',     precio24m:  8800, precio36m: 12400, precio48m: 16000, orden: 2, activo: true },
];

let cache: GpsProveedoresPayload = { proveedores: DEFAULT_PROVEEDORES };
let inflight: Promise<GpsProveedoresPayload> | null = null;
let loaded = false;
const subscribers = new Set<() => void>();

function notify() {
  for (const fn of subscribers) {
    try { fn(); } catch { /* aislado */ }
  }
}

export function getGpsProveedores(): GpsProveedoresPayload {
  return cache;
}

export async function loadGpsProveedores(): Promise<GpsProveedoresPayload> {
  if (typeof window !== 'undefined' && !localStorage.getItem('token')) {
    // Mismo gate que loadCatalog — sin token, no llamamos al server (evita
    // loop con interceptor de axios en /login).
    return cache;
  }
  if (inflight) return inflight;
  inflight = api
    .get<GpsProveedoresPayload>('/config/gps-proveedores')
    .then((res) => {
      cache = res.data;
      loaded = true;
      notify();
      return cache;
    })
    .catch((err) => {
      // eslint-disable-next-line no-console
      console.warn('[gps-proveedores] no se pudo cargar:', err);
      return cache;
    })
    .finally(() => {
      inflight = null;
    });
  return inflight;
}

export async function reloadGpsProveedores(): Promise<GpsProveedoresPayload> {
  inflight = null;
  loaded = false;
  return loadGpsProveedores();
}

export function useGpsProveedores(): GpsProveedoresPayload {
  const [, setTick] = useState(0);
  useEffect(() => {
    if (!loaded && !inflight) void loadGpsProveedores();
    const fn = () => setTick((n) => n + 1);
    subscribers.add(fn);
    return () => { subscribers.delete(fn); };
  }, []);
  return cache;
}

// ── Helpers puros ─────────────────────────────────────────────────

/** Umbral de cambio de proveedor por defecto (Damián 28-04-2026). */
export const UMBRAL_VALOR_BIEN_TECNO = 500_000;

/**
 * Devuelve la clave del proveedor recomendado por default según el
 * valor del bien. El operador puede sobrescribirlo desde el cotizador.
 */
export function proveedorDefault(valorBien: number): 'GBR' | 'TECNO_LOGISTIC' {
  return valorBien < UMBRAL_VALOR_BIEN_TECNO ? 'GBR' : 'TECNO_LOGISTIC';
}

/**
 * Precio del proveedor para el plazo dado. Si el plazo no está en la
 * tabla (12, 18, 30, 42), redondea hacia arriba al siguiente plazo
 * disponible (Damián 28-04-2026):
 *   plazo ≤ 24 → precio24m
 *   plazo ≤ 36 → precio36m
 *   plazo > 36 → precio48m
 */
export function precioGpsPorPlazo(p: GpsProveedor, plazoMeses: number): number {
  if (plazoMeses <= 24) return p.precio24m;
  if (plazoMeses <= 36) return p.precio36m;
  return p.precio48m;
}

/**
 * Helper combinado — busca el proveedor por clave y devuelve el precio
 * para el plazo. Para `clave: null` (Sin GPS) → 0.
 */
export function calcularPrecioGps(
  clave: string | null,
  plazoMeses: number,
  proveedores: GpsProveedor[],
): number {
  if (!clave) return 0;
  const p = proveedores.find((x) => x.clave === clave);
  if (!p) return 0;  // proveedor desactivado / clave histórica desconocida
  return precioGpsPorPlazo(p, plazoMeses);
}
