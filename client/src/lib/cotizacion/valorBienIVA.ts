// Conversión IVA del "Valor del Bien" para el cotizador.
//
// El operador puede capturar el valor del bien CON IVA o SIN IVA según
// cómo se lo haya cotizado el proveedor (toggle en el formulario). La
// VERDAD INTERNA del sistema (`form.valorBien`, lo que consume el motor)
// es SIEMPRE el valor SIN IVA — así que estas dos funciones traducen
// entre lo que el operador teclea/ve y esa verdad interna.
//
// Dinero ⇒ Decimal.js obligatorio (CLAUDE.md regla 2). El factor de IVA
// es 1.16, el mismo que usa el motor (valorConIVA = valorSinIVA × 1.16,
// server/CLAUDE.md §4.2).

import Decimal from 'decimal.js';

/** Factor de IVA del bien (16%). Espejo del motor. */
const FACTOR_IVA = new Decimal(1.16);

/**
 * Valor TECLEADO por el operador → valor SIN IVA (verdad interna).
 * Si el operador indicó que su número ya incluye IVA, se divide entre
 * 1.16; si no, se devuelve igual.
 *
 * NO se redondea a 2 decimales a propósito: el valor sin IVA real de un
 * bien cotizado CON IVA es `C/1.16` (decimales periódicos). Guardarlo a
 * precisión completa hace que el round-trip del DISPLAY (×1.16 → 2 dec)
 * devuelva EXACTAMENTE lo tecleado; si se redondeara aquí, ~14% de los
 * enteros tecleados con IVA derivarían $0.01 al mostrarlos (ej. teclear
 * 1,000,000 mostraría 1,000,000.01). El motor consume precisión completa
 * y redondea en la salida, así que esto no afecta ningún monto.
 */
export function valorBienTecleadoASinIVA(
  teclado: number,
  incluyeIVA: boolean,
): number {
  if (!incluyeIVA) return teclado;
  return new Decimal(teclado).dividedBy(FACTOR_IVA).toNumber();
}

/**
 * Valor SIN IVA (verdad interna) → número que se MUESTRA en el campo
 * según el modo activo. Inverso de `valorBienTecleadoASinIVA`: si el modo
 * es "con IVA" multiplica por 1.16; si no, se devuelve igual.
 */
export function valorBienSinIVAATecleado(
  sinIVA: number,
  incluyeIVA: boolean,
): number {
  if (!incluyeIVA) return sinIVA;
  return new Decimal(sinIVA)
    .times(FACTOR_IVA)
    .toDecimalPlaces(2, Decimal.ROUND_HALF_UP)
    .toNumber();
}
