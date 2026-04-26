/**
 * Branding singleton — datos del emisor (razón social, contacto y banco)
 * que el cliente embebe en PDFs (cotización, recibo, estado de cuenta,
 * amortización, checklist) y muestra en /portal del arrendatario.
 *
 * Diseño:
 *   • Una sola fuente de verdad: GET /api/config/branding (servidor)
 *   • Fallback síncrono con valores por default (evita flicker en
 *     PDFs que se renderizan antes de que la fetch resuelva).
 *   • Singleton mutable: loadBranding() actualiza el cache; getBranding()
 *     siempre devuelve algo válido (default o fresco).
 *   • Carga en boot — App.tsx llama loadBranding() una vez al montar.
 *
 * Por qué un singleton y no React Query / Context:
 *   • Los componentes PDF (@react-pdf/renderer) son funciones puras que
 *     deben ser sincrónicas — no pueden hacer hooks ni esperar promesas.
 *   • Threadear el config por props desde 8 sitios de uso multiplica
 *     el ruido sin beneficio (los datos NO cambian entre renders ni por
 *     usuario; son constantes globales del tenant).
 */
import { useEffect, useState } from 'react';
import api from './api';

export interface BrandingConfig {
  empresa: {
    razonSocial: string;       // 'FSMP Soluciones de Capital, S.A. de C.V., SOFOM, E.N.R.'
    nombreComercial: string;   // 'Inyecta'
  };
  contacto: {
    direccion: string;
    telefonos: string;          // '444-521-7204 / 444-521-6980'
    email: string;              // 'contacto@inyecta.com.mx'
    web: string;                // 'www.inyecta.com.mx'
  };
  banco: {
    nombre: string;             // 'BBVA México'
    clabe: string;              // '012-180-XXXXXXXXXX-X'
    beneficiario: string;
  };
}

// Defaults = valores históricos hardcoded en los 8 archivos. Sirven
// como fallback síncrono si:
//   • El backend está caído (los PDFs siguen funcionando con datos
//     correctos, sólo desactualizados si Inyecta cambió algo).
//   • La fetch no completó antes de que el usuario haga click en
//     "descargar PDF" (poco probable, App.tsx la dispara al montar).
const DEFAULT_BRANDING: BrandingConfig = {
  empresa: {
    razonSocial: 'FSMP Soluciones de Capital, S.A. de C.V., SOFOM, E.N.R.',
    nombreComercial: 'Inyecta',
  },
  contacto: {
    direccion:
      'Av. Sierra Vista 1305, Piso 4 Oficina 7, Col. Lomas del Tecnológico, C.P. 78215, San Luis Potosí, S.L.P.',
    telefonos: '444-521-7204 / 444-521-6980',
    email: 'contacto@inyecta.com.mx',
    web: 'www.inyecta.com.mx',
  },
  banco: {
    nombre: 'BBVA México',
    clabe: '012-180-XXXXXXXXXX-X',
    beneficiario: 'FSMP Soluciones de Capital, S.A. de C.V., SOFOM, E.N.R.',
  },
};

let cache: BrandingConfig = DEFAULT_BRANDING;
let inflight: Promise<BrandingConfig> | null = null;
let loaded = false;
const subscribers = new Set<() => void>();

function notify() {
  for (const fn of subscribers) {
    try {
      fn();
    } catch {
      /* aislado: un suscriptor roto no debe afectar a los demás */
    }
  }
}

/**
 * Devuelve el branding actual de manera síncrona. Siempre regresa un
 * objeto válido (default si la fetch aún no termina).
 */
export function getBranding(): BrandingConfig {
  return cache;
}

/**
 * Carga el branding desde el backend y actualiza el cache. Idempotente:
 * llamadas concurrentes comparten la misma promesa en vuelo. Errores
 * se loggean y el cache mantiene el último valor válido (default si
 * nunca cargamos).
 *
 * Llamar UNA VEZ en App.tsx al montar. Es seguro re-llamarla (p.ej.
 * tras un cambio de tenant), aunque hoy no hay multi-tenant.
 */
export async function loadBranding(): Promise<BrandingConfig> {
  if (inflight) return inflight;
  inflight = api
    .get<BrandingConfig>('/config/branding')
    .then((res) => {
      cache = res.data;
      loaded = true;
      notify();
      return cache;
    })
    .catch((err) => {
      // No es crítico — los PDFs siguen funcionando con defaults. Loggea
      // y devuelve el cache actual para que la app no se rompa.
      // eslint-disable-next-line no-console
      console.warn('[branding] no se pudo cargar /api/config/branding:', err);
      return cache;
    })
    .finally(() => {
      inflight = null;
    });
  return inflight;
}

/**
 * Hook React: devuelve el branding actual y re-renderiza cuando llegue
 * el dato fresco del backend. Útil para páginas estáticas que renderizan
 * antes de que loadBranding() resuelva (Login, Portal). Los PDFs no lo
 * necesitan porque se generan on-click, ya con cache fresco.
 *
 * Si la fetch nunca completa, el componente se queda con el default —
 * exactamente igual a lo que había hardcoded antes de este refactor.
 */
export function useBranding(): BrandingConfig {
  const [, setTick] = useState(0);
  useEffect(() => {
    // Si todavía no hay carga remota, dispara una. App.tsx ya lo hace
    // al boot, así que esto sólo aplica si por algún motivo el componente
    // aparece sin que App.tsx haya corrido (tests, ssr, etc.).
    if (!loaded && !inflight) {
      void loadBranding();
    }
    const fn = () => setTick((n) => n + 1);
    subscribers.add(fn);
    return () => {
      subscribers.delete(fn);
    };
  }, []);
  return cache;
}

// ─── Helpers de formato (evitan repetir transformaciones en 8 sitios) ───

/** Razón social en MAYÚSCULAS para headers de PDFs (matchea el Excel original). */
export function razonSocialUpper(): string {
  return cache.empresa.razonSocial.toUpperCase();
}

/** Bloque de contacto formateado para footers (4 líneas). */
export function contactoLineas(): { direccion: string; telefonos: string; email: string; web: string } {
  return {
    direccion: cache.contacto.direccion,
    telefonos: `Teléfonos: ${cache.contacto.telefonos}`,
    email: `E-mail: ${cache.contacto.email}`,
    web: `Página web: ${cache.contacto.web}`,
  };
}
