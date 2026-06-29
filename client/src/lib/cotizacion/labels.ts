/**
 * Etiquetas dependientes del producto (fuente única, para no desincronizar).
 */
import type { ResultadoCotizacion } from './calculos';

/**
 * Nombre del pago inicial del cliente que reduce la base del bien.
 * - FINANCIERO: "Enganche" — sí hay compra (vía la opción), es un enganche real.
 * - PURO: "Anticipo de rentas" — no hay compra; es renta pagada por adelantado.
 * Regla de negocio (Damián, 28-06-2026): "enganche" en todo el sistema,
 * sólo en puro se renombra.
 */
export function engancheLabel(producto: ResultadoCotizacion['producto']): string {
  return producto === 'PURO' ? 'Anticipo de rentas' : 'Enganche';
}
